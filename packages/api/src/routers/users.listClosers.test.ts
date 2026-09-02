import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { db, inArray } from "@crm-fran/db";
import { roles, user } from "@crm-fran/db/schema/index";
import { appRouter } from "./index";
import type { Context } from "../context";
import type { Permission } from "@crm-fran/db/schema/auth";
import { listClosers } from "../users/services/list-closers";

describe("listClosers", () => {
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await db
      .insert(roles)
      .values([
        { id: "role-caller", name: "Caller", permissions: ["leads:*", "users:read"] },
        { id: "role-closer", name: "Closer", permissions: ["leads:*", "alerts:*"] },
        { id: "role-admin", name: "Admin", permissions: ["*"] },
      ])
      .onConflictDoNothing();
  });

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }
    createdUserIds.length = 0;
  });

  async function insertUser(input: { id: string; name: string; email: string; roleId: string }) {
    createdUserIds.push(input.id);
    await db.insert(user).values(input);
    return input;
  }

  function createCaller(userId: string, roleId: string, permissions: Permission[]) {
    const ctx = {
      session: {
        user: {
          id: userId,
          roleId,
          name: "Test",
          email: "test@example.com",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      role: { id: roleId, name: roleId, permissions },
      permissions,
    } as Context;
    return appRouter.createCaller(ctx);
  }

  it("returns only users with roleId role-closer", async () => {
    const closerId = crypto.randomUUID();
    const callerId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer A", email: "closer-a@test.com", roleId: "role-closer" });
    await insertUser({ id: callerId, name: "Caller A", email: "caller-a@test.com", roleId: "role-caller" });

    const result = await listClosers();

    expect(result.map((u) => u.id)).toContain(closerId);
    expect(result.map((u) => u.id)).not.toContain(callerId);
    expect(result.every((u) => u.name && u.email)).toBe(true);
  });

  it("excludes callers without assuming the database has no closers", async () => {
    const callerId = crypto.randomUUID();
    await insertUser({ id: callerId, name: "Caller B", email: "caller-b@test.com", roleId: "role-caller" });

    const result = await listClosers();
    expect(result.map((u) => u.id)).not.toContain(callerId);
  });

  it("returns closers ordered by name ascending", async () => {
    const closerA = crypto.randomUUID();
    const closerB = crypto.randomUUID();

    await insertUser({ id: closerA, name: "Zoe Closer", email: "zoe@test.com", roleId: "role-closer" });
    await insertUser({ id: closerB, name: "Amy Closer", email: "amy@test.com", roleId: "role-closer" });

    const result = await listClosers();
    const createdCloserIds = new Set<string>([closerA, closerB]);
    const createdClosers = result.filter((u) => createdCloserIds.has(u.id));
    expect(createdClosers.map((u) => u.name)).toEqual(["Amy Closer", "Zoe Closer"]);
  });

  it("allows users with users:read to call users.listClosers", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    await insertUser({ id: callerId, name: "Caller C", email: "caller-c@test.com", roleId: "role-caller" });
    await insertUser({ id: closerId, name: "Closer C", email: "closer-c@test.com", roleId: "role-closer" });

    const caller = createCaller(callerId, "role-caller", ["leads:*", "users:read"]);
    const result = await (caller as unknown as { users: { listClosers: () => Promise<Array<{ id: string; name: string; email: string }>> } }).users.listClosers();

    expect(result.map((u) => u.id)).toContain(closerId);
  });

  it("throws FORBIDDEN for users without users:read", async () => {
    const callerId = crypto.randomUUID();
    await insertUser({ id: callerId, name: "Caller D", email: "caller-d@test.com", roleId: "role-caller" });

    const caller = createCaller(callerId, "role-caller", ["leads:*"]);

    await expect((caller as unknown as { users: { listClosers: () => Promise<Array<unknown>> } }).users.listClosers()).rejects.toThrow();
    await expect((caller as unknown as { users: { listClosers: () => Promise<Array<unknown>> } }).users.listClosers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
