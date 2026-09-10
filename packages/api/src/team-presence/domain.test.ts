import { describe, expect, it } from "vitest";

import {
  ONLINE_THRESHOLD_MS,
  OFFLINE_THRESHOLD_MS,
  buildTeamPresenceDto,
  derivePresenceState,
  selectVisibleTeamPresenceRows,
} from "./domain";

const now = new Date("2026-09-09T12:00:00.000Z");

describe("team presence privacy domain", () => {
  it("derives exact online, away and offline threshold boundaries with an injected clock", () => {
    expect(derivePresenceState(new Date(now.getTime() - ONLINE_THRESHOLD_MS + 1), now)).toBe("online");
    expect(derivePresenceState(new Date(now.getTime() - ONLINE_THRESHOLD_MS), now)).toBe("away");
    expect(derivePresenceState(new Date(now.getTime() - OFFLINE_THRESHOLD_MS + 1), now)).toBe("away");
    expect(derivePresenceState(new Date(now.getTime() - OFFLINE_THRESHOLD_MS), now)).toBe("offline");
    expect(derivePresenceState(null, now)).toBe("offline");
  });

  it("returns a minimal coarse DTO without raw timestamps or activity context", () => {
    const dto = buildTeamPresenceDto({
      userId: "user-1",
      displayName: "Alex",
      roleName: "Closer",
      category: "sales",
      lastHeartbeatAt: new Date(now.getTime() - ONLINE_THRESHOLD_MS),
    }, { now, includeRole: true });

    expect(dto).toEqual({
      userId: "user-1",
      displayName: "Alex",
      roleName: "Closer",
      status: "away",
      category: "sales",
      lastActiveBucket: "recently",
    });
    for (const forbidden of ["path", "pathname", "url", "route", "leadId", "customerId", "payload", "query", "lastHeartbeatAt"]) {
      expect(forbidden in dto).toBe(false);
    }
  });

  it("keeps every online member and only the three most recent non-online heartbeats", () => {
    const rows = [
      { userId: "online-1", displayName: "Ana", roleName: "Caller", category: "sales" as const, lastHeartbeatAt: new Date(now.getTime() - 10_000) },
      { userId: "recent-3", displayName: "Carmen", roleName: "Closer", category: "crm" as const, lastHeartbeatAt: new Date(now.getTime() - 16 * 60_000) },
      { userId: "never", displayName: "Nunca", roleName: "Admin", category: null, lastHeartbeatAt: null },
      { userId: "recent-1", displayName: "Bea", roleName: "Closer", category: "coaching" as const, lastHeartbeatAt: new Date(now.getTime() - 3 * 60_000) },
      { userId: "online-2", displayName: "Zoe", roleName: "Admin", category: "administration" as const, lastHeartbeatAt: new Date(now.getTime() - 20_000) },
      { userId: "recent-4", displayName: "Dani", roleName: "Caller", category: "sales" as const, lastHeartbeatAt: new Date(now.getTime() - 30 * 60_000) },
      { userId: "recent-2", displayName: "Carlos", roleName: "Caller", category: "sales" as const, lastHeartbeatAt: new Date(now.getTime() - 4 * 60_000) },
    ];

    expect(selectVisibleTeamPresenceRows(rows, now).map((row) => row.userId)).toEqual([
      "online-1",
      "online-2",
      "recent-1",
      "recent-2",
      "recent-3",
    ]);
  });

  it("hides roles when the viewer lacks existing user-directory permission", () => {
    const dto = buildTeamPresenceDto({ userId: "user-2", displayName: "Sam", roleName: "Admin", category: null, lastHeartbeatAt: null }, { now, includeRole: false });
    expect(dto).toEqual({ userId: "user-2", displayName: "Sam", status: "offline", category: null, lastActiveBucket: "never" });
  });
});
