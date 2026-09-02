import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const PERSONAL_GOAL_METRIC = {
  CONTACTED: "contacted",
  SHOWS: "shows",
  APPOINTMENTS: "appointments",
  APPOINTMENT_RATE: "appointment_rate",
  ASSIGNED: "assigned",
  FUTURE_CALLS: "future_calls",
} as const;

export type PersonalGoalMetric =
  (typeof PERSONAL_GOAL_METRIC)[keyof typeof PERSONAL_GOAL_METRIC];

export const personalGoals = pgTable(
  "personal_goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    metric: text("metric").$type<PersonalGoalMetric>().notNull(),
    targetValue: integer("target_value").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("personal_goals_user_interval_idx").on(
      table.userId,
      table.startDate,
      table.endDate,
    ),
    check(
      "personal_goals_metric_check",
      sql`${table.metric} IN ('contacted', 'shows', 'appointments', 'appointment_rate', 'assigned', 'future_calls')`,
    ),
    check("personal_goals_target_positive_check", sql`${table.targetValue} > 0`),
    check("personal_goals_interval_check", sql`${table.startDate} <= ${table.endDate}`),
  ],
);
