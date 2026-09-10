import type { TeamPresenceCategory } from "@crm-fran/db/schema/team-presence";
export type { TeamPresenceCategory } from "@crm-fran/db/schema/team-presence";

export const ONLINE_THRESHOLD_MS = 2 * 60 * 1_000;
export const OFFLINE_THRESHOLD_MS = 15 * 60 * 1_000;
export const HEARTBEAT_MIN_WRITE_INTERVAL_MS = 60 * 1_000;

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
