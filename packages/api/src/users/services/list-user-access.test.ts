import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db, inArray } from "@crm-fran/db";
import { roles, user } from "@crm-fran/db/schema/index";

import type { Context } from "../../context";
import { appRouter } from "../../routers";
import { listUserAccess } from "./list-user-access";

describe("user access directory", () => {
  const userIds: string[] = [];
  const roleIds: string[] = [];

  beforeAll(async () => {
    const suffix = crypto.randomUUID();
    roleIds.push(`role-access-a-${suffix}`, `role-access-b-${suffix}`, `role-empty-${suffix}`);
    await db.insert(roles).values([
      { id: roleIds[0]!, name: "Caller test", permissions: ["leads:*", "alerts:read"] },
      { id: roleIds[1]!, name: "Closer test", permissions: ["leads:read", "alerts:*"] },
      { id: roleIds[2]!, name: "Empty test", permissions: ["reports:read"] },
    ]);
  });

  afterEach(async () => {
    if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.delete(roles).where(inArray(roles.id, roleIds));
  });

  async function createUser(input: { name: string; email: string; roleId: string; emailVerified?: boolean }) {
    const id = crypto.randomUUID();
    userIds.push(id);
    await db.insert(user).values({ id, emailVerified: input.emailVerified ?? false, ...input });
    return id;
  }

  function caller(permissions: Context["permissions"]) {
    return appRouter.createCaller({
      session: { user: { id: "actor", name: "Actor", email: "actor@test.com", roleId: "role-admin", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } },
      role: { id: "role-admin", name: "Admin", permissions },
      permissions,
    } as Context);
  }

  it("returns sanitized users, all roles and effective permissions", async () => {
    const firstId = await createUser({ name: "Ana Caller", email: "ana@example.com", roleId: roleIds[0]!, emailVerified: true });
    await createUser({ name: "Beto Closer", email: "beto@example.com", roleId: roleIds[1]! });

    const result = await listUserAccess({});
    const first = result.users.find((entry) => entry.id === firstId)!;
    const emptyRole = result.roles.find((entry) => entry.id === roleIds[2]);

    expect(first).toEqual({
      id: firstId,
      name: "Ana Caller",
      email: "ana@example.com",
      status: "verified",
      roles: [{ id: roleIds[0], name: "Caller test" }],
      effectivePermissions: ["alerts:read", "leads:*"],
    });
    expect(Object.keys(first).sort()).toEqual(["effectivePermissions", "email", "id", "name", "roles", "status"]);
    expect(emptyRole).toMatchObject({ userCount: 0, effectivePermissions: ["reports:read"] });
    expect(JSON.stringify(result)).not.toMatch(/token|session|password|ipAddress|userAgent/i);
  });

  it("applies compact search, role and status filters independently", async () => {
    const matchingId = await createUser({ name: "Lucia Ventas", email: "lucia@example.com", roleId: roleIds[1]!, emailVerified: true });
    await createUser({ name: "Otro Perfil", email: "otro@example.com", roleId: roleIds[0]! });

    const result = await listUserAccess({ search: "LUCIA", roleId: roleIds[1], status: "verified" });

    expect(result.users.map((entry) => entry.id)).toEqual([matchingId]);
  });

  it("requires wildcard administration at the tRPC boundary", async () => {
    await expect(caller(["users:read"]).users.accessDirectory()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(["*"]).users.accessDirectory()).resolves.toMatchObject({ users: expect.any(Array), roles: expect.any(Array) });
  });

  it("keeps visibility reads authenticated but writes wildcard-only", async () => {
    await expect(caller(["users:read"]).users.navigationVisibility()).resolves.toMatchObject({ configured: false, version: 0 });
    await expect(caller(["users:read"]).users.updateNavigationVisibility({ expectedVersion: 0, entries: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
