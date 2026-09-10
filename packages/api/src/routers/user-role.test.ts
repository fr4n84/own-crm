import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
import { COMMERCIAL_ROLE_IDS, user } from "@crm-fran/db/schema/auth";

const persistence = vi.hoisted(() => ({ result: vi.fn(), set: vi.fn(), where: vi.fn(), eq: vi.fn(), update: vi.fn() }));
const lifecycle = vi.hoisted(() => ({ update: vi.fn() }));
const navigation = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@crm-fran/db", () => ({
  db: { update: persistence.update }, and: (...args: unknown[]) => args, eq: persistence.eq,
}));
vi.mock("../users/services/list-closers", () => ({ listClosers: vi.fn() }));
vi.mock("../users/services/list-user-access", () => ({ listUserAccess: vi.fn() }));
vi.mock("../users/services/navigation-visibility", () => ({ getNavigationVisibility: navigation.get, updateNavigationVisibility: navigation.update }));
vi.mock("../users/services/user-access-lifecycle", () => ({ updateUserAccessStatus: lifecycle.update }));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../leads/services/index", () => ({ isCloserOf: vi.fn(), hasCloserSession: vi.fn() }));
import { usersRouter } from "./users";

const date = new Date();
const session = {
  session: { id: "session", token: "token", userId: "admin", expiresAt: date, createdAt: date, updatedAt: date },
  user: { id: "admin", name: "Admin", email: "admin@example.com", emailVerified: true, accessStatus: "active", createdAt: date, updatedAt: date, roleId: "role-admin", leadActive: "", scoring: 0 },
};
const context = { session, role: null, permissions: ["*"] } satisfies Context;
const input = { userId: "commercial", expectedRoleId: "role-caller" as const, roleId: "role-closer" as const };

describe("commercial role administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.update.mockReturnValue({ set: persistence.set });
    persistence.set.mockReturnValue({ where: persistence.where });
    persistence.where.mockReturnValue({ returning: persistence.result });
    persistence.result.mockResolvedValue([{ id: input.userId, roleId: input.roleId }]);
  });
  for (const roleId of COMMERCIAL_ROLE_IDS) {
    it(`permits admin to assign ${roleId}`, async () => {
      await usersRouter.createCaller(context).updateCommercialRole({ ...input, roleId });
      expect(persistence.set).toHaveBeenCalledWith({ roleId });
      expect(persistence.eq).toHaveBeenCalledWith(user.id, input.userId);
      expect(persistence.eq).toHaveBeenCalledWith(user.roleId, input.expectedRoleId);
    });
  }
  for (const permissions of [[], ["users:*"], ["users:update"]] as Context["permissions"][]) {
    it(`denies non-admin permissions ${permissions}`, async () => {
      await expect(usersRouter.createCaller({ ...context, permissions }).updateCommercialRole(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(persistence.update).not.toHaveBeenCalled();
    });
  }
  it("requires a session", async () => {
    await expect(usersRouter.createCaller({ session: null, role: null, permissions: [] }).updateCommercialRole(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(persistence.update).not.toHaveBeenCalled();
  });
  for (const invalid of [{ roleId: "role-admin", leadActive: "", scoring: 0 }, { roleId: "unknown" }, { expectedRoleId: "role-admin" }]) {
    it(`rejects an invalid role ${JSON.stringify(invalid)}`, async () => {
      // Exercise a forged transport payload, not a type-safe client.
      await expect(usersRouter.createCaller(context).updateCommercialRole({ ...input, ...invalid } as typeof input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(persistence.update).not.toHaveBeenCalled();
    });
  }
  it("does not overwrite a changed, admin or missing target", async () => {
    persistence.result.mockResolvedValue([]);
    await expect(usersRouter.createCaller(context).updateCommercialRole(input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("account access administration", () => {
  const accessInput = { userId: "target", action: "approve" as const, expectedStatus: "pending" as const, expectedVersion: 1 };
  beforeEach(() => { vi.clearAllMocks(); lifecycle.update.mockResolvedValue({ id: "target", accessStatus: "active", statusVersion: 2 }); });
  it("requires wildcard administration and forwards actor-bound CAS input", async () => {
    await expect(usersRouter.createCaller({ ...context, permissions: ["users:*"] }).updateAccessStatus(accessInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(usersRouter.createCaller(context).updateAccessStatus(accessInput)).resolves.toMatchObject({ accessStatus: "active", statusVersion: 2 });
    expect(lifecycle.update).toHaveBeenCalledWith({ actorId: "admin", targetUserId: "target", action: "approve", expectedStatus: "pending", expectedVersion: 1, reason: undefined });
  });
});

describe("navigation visibility administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.get.mockResolvedValue({ configured: true, version: 2, roleIdsByModule: {} });
  });

  it("keeps visibility reads authenticated but writes wildcard-only", async () => {
    await expect(usersRouter.createCaller({ ...context, permissions: ["users:read"] }).navigationVisibility()).resolves.toEqual({
      configured: true,
      version: 2,
      roleIdsByModule: {},
    });
    await expect(usersRouter.createCaller({ ...context, permissions: ["users:read"] }).updateNavigationVisibility({ expectedVersion: 0, entries: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(navigation.update).not.toHaveBeenCalled();
  });
});
