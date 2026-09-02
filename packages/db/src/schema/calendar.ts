import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const calendarPreferences = pgTable(
  "calendar_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    agendaDurationMinutes: integer("agenda_duration_minutes")
      .default(60)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "calendar_preferences_agenda_duration_check",
      sql`${table.agendaDurationMinutes} BETWEEN 5 AND 720`,
    ),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    callerId: text("caller_id").references(() => user.id, {
      onDelete: "set null",
    }),
    closerId: text("closer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("calendar_events_date_idx").on(table.date),
    index("calendar_events_caller_id_idx").on(table.callerId),
    index("calendar_events_closer_id_idx").on(table.closerId),
    check(
      "calendar_events_duration_check",
      sql`${table.durationMinutes} BETWEEN 5 AND 720`,
    ),
    check("calendar_events_date_check", sql`${table.date} ~ '^\\d{4}-\\d{2}-\\d{2}$'`),
    check("calendar_events_start_time_check", sql`${table.startTime} ~ '^\\d{2}:\\d{2}$'`),
  ],
);

export const calendarPreferencesRelations = relations(
  calendarPreferences,
  ({ one }) => ({
    user: one(user, {
      fields: [calendarPreferences.userId],
      references: [user.id],
    }),
  }),
);
