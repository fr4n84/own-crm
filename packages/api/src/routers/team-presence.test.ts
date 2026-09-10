import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";

const service = vi.hoisted(() => ({ heartbeat: vi.fn(), list: vi.fn() }));
vi.mock("../team-presence/runtime", () => ({ teamPresenceService: service }));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../leads/services/index", () => ({ isCloserOf: vi.fn(), hasCloserSession: vi.fn() }));

import { teamPresenceRouter } from "./team-presence";

const now = new Date("2026-09-09T12:00:00.000Z");
function context(permissions: Context["permissions"] = [], accessStatus = "active"): Context {
  return {
    session: {
      session: { id: "s", token: "t", userId: "session-user", expiresAt: now, createdAt: now, updatedAt: now },
      user: { id: "session-user", name: "Alex", email: "alex@example.com", emailVerified: true, accessStatus, createdAt: now, updatedAt: now, roleId: "role-closer", leadActive: "", scoring: 0 },
    },
    role: null,
    permissions,
  } as Context;
}

describe("team presence router boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.heartbeat.mockResolvedValue({ accepted: true, written: true });
    service.list.mockResolvedValue([]);
  });

  it("uses the authenticated user id and never accepts identity from input", async () => {
    await teamPresenceRouter.createCaller(context()).heartbeat({ category: "sales" });
    expect(service.heartbeat).toHaveBeenCalledWith({ userId: "session-user", category: "sales" });
  });

  it("rejects attempts to provide another user identity", async () => {
    await expect(teamPresenceRouter.createCaller(context()).heartbeat({ category: "sales", userId: "other-user" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.heartbeat).not.toHaveBeenCalled();
  });

  it("rejects arbitrary categories before the service", async () => {
    await expect(teamPresenceRouter.createCaller(context()).heartbeat({ category: "lead-123" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.heartbeat).not.toHaveBeenCalled();
  });

  it("allows active authenticated teammates but exposes roles only with existing users:read permission", async () => {
    await teamPresenceRouter.createCaller(context()).list();
    expect(service.list).toHaveBeenLastCalledWith({ includeRoles: false });

    await teamPresenceRouter.createCaller(context(["users:read"])).list();
    expect(service.list).toHaveBeenLastCalledWith({ includeRoles: true });
  });

  it("rejects inactive accounts before reading or writing presence", async () => {
    await expect(teamPresenceRouter.createCaller(context([], "disabled")).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.list).not.toHaveBeenCalled();
  });
});
