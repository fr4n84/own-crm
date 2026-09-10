import { describe, expect, it } from "vitest";

import {
  ONLINE_THRESHOLD_MS,
  OFFLINE_THRESHOLD_MS,
  buildTeamPresenceDto,
  derivePresenceState,
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

  it("hides roles when the viewer lacks existing user-directory permission", () => {
    const dto = buildTeamPresenceDto({ userId: "user-2", displayName: "Sam", roleName: "Admin", category: null, lastHeartbeatAt: null }, { now, includeRole: false });
    expect(dto).toEqual({ userId: "user-2", displayName: "Sam", status: "offline", category: null, lastActiveBucket: "never" });
  });
});
