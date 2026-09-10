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

  it("returns every online member plus only the three most recently active non-online members", async () => {
    const heartbeatAt = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
    const repository = {
      upsertHeartbeat: vi.fn(),
      listActiveUsers: vi.fn().mockResolvedValue([
        { userId: "online-1", displayName: "Ana", roleName: "Caller", category: "crm", lastHeartbeatAt: heartbeatAt(0.5) },
        { userId: "recent-4", displayName: "Elena", roleName: null, category: null, lastHeartbeatAt: heartbeatAt(30) },
        { userId: "recent-2", displayName: "Carla", roleName: "Closer", category: "calls", lastHeartbeatAt: heartbeatAt(5) },
        { userId: "never", displayName: "Nuria", roleName: null, category: null, lastHeartbeatAt: null },
        { userId: "online-2", displayName: "Bruno", roleName: null, category: "coaching", lastHeartbeatAt: heartbeatAt(1) },
        { userId: "recent-1", displayName: "Diego", roleName: null, category: null, lastHeartbeatAt: heartbeatAt(3) },
        { userId: "recent-3", displayName: "Fátima", roleName: null, category: "crm", lastHeartbeatAt: heartbeatAt(20) },
      ]),
    };
    const service = createTeamPresenceService(repository, () => now);

    const result = await service.list({ includeRoles: false });

    expect(result.map((member) => member.userId)).toEqual([
      "online-1",
      "online-2",
      "recent-1",
      "recent-2",
      "recent-3",
    ]);
    expect(result).not.toContainEqual(expect.objectContaining({ userId: "recent-4" }));
    expect(result).not.toContainEqual(expect.objectContaining({ userId: "never" }));
    expect(result).toEqual(
      expect.arrayContaining([
        {
          userId: "online-1",
          displayName: "Ana",
          status: "online",
          category: "crm",
          lastActiveBucket: "now",
        },
      ]),
    );
    for (const member of result) {
      expect(member).not.toHaveProperty("lastHeartbeatAt");
      expect(member).not.toHaveProperty("pathname");
    }
  });
});
