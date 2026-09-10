import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const TEAM_PRESENCE_CATEGORIES = ["crm", "sales", "coaching", "administration"] as const;
export type TeamPresenceCategory = (typeof TEAM_PRESENCE_CATEGORIES)[number];

export const teamPresence = pgTable("team_presence", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  category: text("category").$type<TeamPresenceCategory>().notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("team_presence_category_check", sql`${table.category} IN ('crm','sales','coaching','administration')`),
  index("team_presence_last_heartbeat_idx").on(table.lastHeartbeatAt),
]);

export const teamPresenceRelations = relations(teamPresence, ({ one }) => ({
  user: one(user, { fields: [teamPresence.userId], references: [user.id] }),
}));
