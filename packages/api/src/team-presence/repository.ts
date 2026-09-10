import { asc, db, eq, sql } from "@crm-fran/db";
import { roles, teamPresence, user, USER_ACCESS_STATUS, type TeamPresenceCategory } from "@crm-fran/db/schema/index";

import type { TeamPresenceRow } from "./domain";

export type HeartbeatWrite = { userId: string; category: TeamPresenceCategory; now: Date; minWriteIntervalMs: number };
export interface TeamPresenceRepository {
  upsertHeartbeat(input: HeartbeatWrite): Promise<{ written: boolean }>;
  listActiveUsers(): Promise<TeamPresenceRow[]>;
}

export const teamPresenceRepository: TeamPresenceRepository = {
  async upsertHeartbeat(input) {
    const staleBefore = new Date(input.now.getTime() - input.minWriteIntervalMs);
    const updated = await db.insert(teamPresence).values({
      userId: input.userId,
      category: input.category,
      lastHeartbeatAt: input.now,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: teamPresence.userId,
      set: { category: input.category, lastHeartbeatAt: input.now, updatedAt: input.now },
      setWhere: sql`${teamPresence.lastHeartbeatAt} <= ${staleBefore}`,
    }).returning({ userId: teamPresence.userId });
    return { written: updated.length === 1 };
  },

  async listActiveUsers() {
    return db.select({
      userId: user.id,
      displayName: user.name,
      roleName: roles.name,
      category: teamPresence.category,
      lastHeartbeatAt: teamPresence.lastHeartbeatAt,
    }).from(user)
      .innerJoin(roles, eq(user.roleId, roles.id))
      .leftJoin(teamPresence, eq(teamPresence.userId, user.id))
      .where(eq(user.accessStatus, USER_ACCESS_STATUS.ACTIVE))
      .orderBy(asc(user.name), asc(user.id));
  },
};
