import type { TeamPresenceCategory } from "@crm-fran/db/schema/team-presence";

import { buildTeamPresenceDto, HEARTBEAT_MIN_WRITE_INTERVAL_MS } from "./domain";
import type { TeamPresenceRepository } from "./repository";

export function createTeamPresenceService(repository: TeamPresenceRepository, clock: () => Date = () => new Date()) {
  return {
    async heartbeat(input: { userId: string; category: TeamPresenceCategory }) {
      const result = await repository.upsertHeartbeat({
        ...input,
        now: clock(),
        minWriteIntervalMs: HEARTBEAT_MIN_WRITE_INTERVAL_MS,
      });
      return { accepted: true as const, written: result.written };
    },

    async list(options: { includeRoles: boolean }) {
      const now = clock();
      const rows = await repository.listActiveUsers();
      return rows.map((row) => buildTeamPresenceDto(row, { now, includeRole: options.includeRoles }));
    },
  };
}
