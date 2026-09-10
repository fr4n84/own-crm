import type { TeamPresenceCategory } from "@crm-fran/db/schema/team-presence";
export type { TeamPresenceCategory } from "@crm-fran/db/schema/team-presence";

export const ONLINE_THRESHOLD_MS = 2 * 60 * 1_000;
export const OFFLINE_THRESHOLD_MS = 15 * 60 * 1_000;
export const HEARTBEAT_MIN_WRITE_INTERVAL_MS = 60 * 1_000;
export const RECENT_TEAM_PRESENCE_LIMIT = 3;

export type TeamPresenceState = "online" | "away" | "offline";
export type LastActiveBucket = "now" | "recently" | "earlier" | "never";
export type TeamPresenceRow = { userId: string; displayName: string; roleName: string; category: TeamPresenceCategory | null; lastHeartbeatAt: Date | null };
export type TeamPresenceDto = { userId: string; displayName: string; roleName?: string; status: TeamPresenceState; category: TeamPresenceCategory | null; lastActiveBucket: LastActiveBucket };

export function derivePresenceState(lastHeartbeatAt: Date | null, now: Date): TeamPresenceState {
  if (!lastHeartbeatAt) return "offline";
  const ageMs = Math.max(0, now.getTime() - lastHeartbeatAt.getTime());
  if (ageMs < ONLINE_THRESHOLD_MS) return "online";
  if (ageMs < OFFLINE_THRESHOLD_MS) return "away";
  return "offline";
}

export function selectVisibleTeamPresenceRows(
  rows: readonly TeamPresenceRow[],
  now: Date,
): TeamPresenceRow[] {
  const online: TeamPresenceRow[] = [];
  const recent: TeamPresenceRow[] = [];

  for (const row of rows) {
    if (derivePresenceState(row.lastHeartbeatAt, now) === "online") {
      online.push(row);
    } else if (row.lastHeartbeatAt) {
      recent.push(row);
    }
  }

  recent.sort((left, right) => {
    const heartbeatDifference = right.lastHeartbeatAt!.getTime() - left.lastHeartbeatAt!.getTime();
    if (heartbeatDifference !== 0) return heartbeatDifference;
    const nameDifference = left.displayName.localeCompare(right.displayName);
    return nameDifference !== 0 ? nameDifference : left.userId.localeCompare(right.userId);
  });

  return [...online, ...recent.slice(0, RECENT_TEAM_PRESENCE_LIMIT)];
}

function deriveLastActiveBucket(lastHeartbeatAt: Date | null, state: TeamPresenceState): LastActiveBucket {
  if (!lastHeartbeatAt) return "never";
  if (state === "online") return "now";
  if (state === "away") return "recently";
  return "earlier";
}

export function buildTeamPresenceDto(row: TeamPresenceRow, options: { now: Date; includeRole: boolean }): TeamPresenceDto {
  const status = derivePresenceState(row.lastHeartbeatAt, options.now);
  return {
    userId: row.userId,
    displayName: row.displayName,
    ...(options.includeRole ? { roleName: row.roleName } : {}),
    status,
    category: row.category,
    lastActiveBucket: deriveLastActiveBucket(row.lastHeartbeatAt, status),
  };
}
