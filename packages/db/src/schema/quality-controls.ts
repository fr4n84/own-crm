import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const qualityControlSettings = pgTable(
  "quality_control_settings",
  {
    id: text("id").primaryKey().default("global"),
    callerAbandonedHours: integer("caller_abandoned_hours").default(24).notNull(),
    closerAbandonedHours: integer("closer_abandoned_hours").default(24).notNull(),
    callerFollowUpGraceHours: integer("caller_follow_up_grace_hours").default(0).notNull(),
    closerFollowUpGraceHours: integer("closer_follow_up_grace_hours").default(0).notNull(),
    callerLowConversionPercent: integer("caller_low_conversion_percent").default(20).notNull(),
    closerLowConversionPercent: integer("closer_low_conversion_percent").default(20).notNull(),
    updatedById: text("updated_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "quality_control_settings_non_negative_check",
      sql`${table.callerAbandonedHours} >= 0 AND ${table.closerAbandonedHours} >= 0 AND ${table.callerFollowUpGraceHours} >= 0 AND ${table.closerFollowUpGraceHours} >= 0`,
    ),
    check(
      "quality_control_settings_percentage_check",
      sql`${table.callerLowConversionPercent} BETWEEN 0 AND 100 AND ${table.closerLowConversionPercent} BETWEEN 0 AND 100`,
    ),
  ],
);
