import { describe, expect, it, vi } from "vitest";

import { HEARTBEAT_MIN_WRITE_INTERVAL_MS } from "./domain";
import { createTeamPresenceService } from "./service";

const now = new Date("2026-09-09T12:00:00.000Z");

describe("team presence service", () => {
  it("delegates a race-safe bounded heartbeat for only the authenticated identity", async () => {
    const repository = { upsertHeartbeat: vi.fn().mockResolvedValue({ written: false }), listActiveUsers: vi.fn() };
    const service = createTeamPresenceService(repository, () => now);

    await expect(service.heartbeat({ userId: "session-user", category: "coaching" })).resolves.toEqual({ accepted: true, written: false });
    expect(repository.upsertHeartbeat).toHaveBeenCalledWith({
      userId: "session-user",
      category: "coaching",
      now,
      minWriteIntervalMs: HEARTBEAT_MIN_WRITE_INTERVAL_MS,
    });
  });

  it("lists only repository-approved active users and coarsens the response", async () => {
    const repository = {
      upsertHeartbeat: vi.fn(),
      listActiveUsers: vi.fn().mockResolvedValue([
        { userId: "u1", displayName: "Ana", roleName: "Caller", category: "crm", lastHeartbeatAt: new Date(now.getTime() - 20_000) },
        { userId: "u2", displayName: "Luis", roleName: "Closer", category: null, lastHeartbeatAt: null },
      ]),
    };
    const service = createTeamPresenceService(repository, () => now);

    const result = await service.list({ includeRoles: false });
    expect(result).toEqual([
      { userId: "u1", displayName: "Ana", status: "online", category: "crm", lastActiveBucket: "now" },
      { userId: "u2", displayName: "Luis", status: "offline", category: null, lastActiveBucket: "never" },
    ]);
  });
});
