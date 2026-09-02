import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const LEAD_ACTIVITY_KIND = {
  LEAD_CREATED: "lead_created",
  LEAD_TYPE_CHANGED: "lead_type_changed",
  LEAD_ATTRIBUTION_UPDATED: "lead_attribution_updated",
  CALLER_ASSIGNED: "caller_assigned",
  CLOSER_ASSIGNED: "closer_assigned",
  STATE_CHANGED: "state_changed",
  CALLER_FEEDBACK: "caller_feedback",
  CLOSER_FEEDBACK: "closer_feedback",
  APPOINTMENT_SCHEDULED: "appointment_scheduled",
  APPOINTMENT_RESCHEDULED: "appointment_rescheduled",
  ALERT_CREATED: "alert_created",
  ALERT_RESOLVED: "alert_resolved",
  ALERT_DISMISSED: "alert_dismissed",
  LEAD_RECOVERED: "lead_recovered",
  LEAD_DISCARDED: "lead_discarded",
  RECOMMENDATION_SHOWN: "recommendation_shown",
  RECOMMENDATION_OPENED: "recommendation_opened",
  RECOMMENDATION_COMPLETED: "recommendation_completed",
  RECOMMENDATION_SKIPPED: "recommendation_skipped",
} as const;

export type LeadActivityKind =
  (typeof LEAD_ACTIVITY_KIND)[keyof typeof LEAD_ACTIVITY_KIND];

export type LeadActivityMetadata = Record<string, unknown>;

export const leadActivityEvents = pgTable(
  "lead_activity_events",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorRole: text("actor_role"),
    kind: text("kind").$type<LeadActivityKind>().notNull(),
    title: text("title").notNull(),
    description: text("description"),
    metadata: json("metadata")
      .$type<LeadActivityMetadata>()
      .default({})
      .notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_activity_events_dedupe_key_uidx").on(table.dedupeKey),
    index("lead_activity_events_lead_occurred_idx").on(
      table.leadId,
      table.occurredAt,
    ),
    check(
      "lead_activity_events_kind_check",
      sql`${table.kind} IN ('lead_created', 'lead_type_changed', 'lead_attribution_updated', 'caller_assigned', 'closer_assigned', 'state_changed', 'caller_feedback', 'closer_feedback', 'appointment_scheduled', 'appointment_rescheduled', 'alert_created', 'alert_resolved', 'alert_dismissed', 'lead_recovered', 'lead_discarded', 'recommendation_shown', 'recommendation_opened', 'recommendation_completed', 'recommendation_skipped')`,
    ),
  ],
);

export const leadActivityEventsRelations = relations(
  leadActivityEvents,
  ({ one }) => ({
    lead: one(leads, {
      fields: [leadActivityEvents.leadId],
      references: [leads.id],
    }),
    actor: one(user, {
      fields: [leadActivityEvents.actorId],
      references: [user.id],
    }),
  }),
);
