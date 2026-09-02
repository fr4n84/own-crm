import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const RANKING_METRIC = {
  CALLER_LEAD_TAKEN: "caller_lead_taken",
  CALLER_APPOINTMENT: "caller_appointment",
  CALLER_SHOW: "caller_show",
  CLOSER_SALE: "closer_sale",
  CLOSER_FOLLOW_UP_SHOW: "closer_follow_up_show",
} as const;
export type RankingMetric =
  (typeof RANKING_METRIC)[keyof typeof RANKING_METRIC];

export const rankingEvents = pgTable(
  "ranking_events",
  {
    id: text("id").primaryKey(),
    metric: text("metric").$type<RankingMetric>().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ranking_events_dedupe_key_unique").on(table.dedupeKey),
    index("ranking_events_metric_occurred_at_idx").on(
      table.metric,
      table.occurredAt,
    ),
    index("ranking_events_user_occurred_at_idx").on(
      table.userId,
      table.occurredAt,
    ),
    check(
      "ranking_events_metric_check",
      sql`${table.metric} IN ('caller_lead_taken', 'caller_appointment', 'caller_show', 'closer_sale', 'closer_follow_up_show')`,
    ),
  ],
);

export const rankingPointSettings = pgTable(
  "ranking_point_settings",
  {
    id: text("id").primaryKey().default("global"),
    callerLeadTakenPoints: integer("caller_lead_taken_points").default(1).notNull(),
    callerAppointmentPoints: integer("caller_appointment_points").default(3).notNull(),
    callerShowPoints: integer("caller_show_points").default(5).notNull(),
    closerSalePoints: integer("closer_sale_points").default(10).notNull(),
    closerFollowUpShowPoints: integer("closer_follow_up_show_points").default(6).notNull(),
    updatedById: text("updated_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "ranking_point_settings_non_negative_check",
      sql`${table.callerLeadTakenPoints} >= 0 AND ${table.callerAppointmentPoints} >= 0 AND ${table.callerShowPoints} >= 0 AND ${table.closerSalePoints} >= 0 AND ${table.closerFollowUpShowPoints} >= 0`,
    ),
  ],
);

export const rankingMonthlyResults = pgTable(
  "ranking_monthly_results",
  {
    id: text("id").primaryKey(),
    month: text("month").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    points: integer("points").notNull(),
    metrics: json("metrics").$type<Partial<Record<RankingMetric, number>>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ranking_monthly_results_month_user_unique").on(
      table.month,
      table.userId,
    ),
    index("ranking_monthly_results_month_position_idx").on(
      table.month,
      table.position,
    ),
  ],
);
