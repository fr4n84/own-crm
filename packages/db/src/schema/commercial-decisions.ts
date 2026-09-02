import { relations, sql } from "drizzle-orm";
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

export const COMMERCIAL_DECISION_STATUS = {
  PROPOSED: "proposed",
  APPROVED: "approved",
  REJECTED: "rejected",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;
export type CommercialDecisionStatus =
  (typeof COMMERCIAL_DECISION_STATUS)[keyof typeof COMMERCIAL_DECISION_STATUS];

export const COMMERCIAL_DECISION_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;
export type CommercialDecisionPriority =
  (typeof COMMERCIAL_DECISION_PRIORITY)[keyof typeof COMMERCIAL_DECISION_PRIORITY];

export const COMMERCIAL_DECISION_SOURCE = {
  PROFITABILITY: "profitability",
  COMMERCIAL_INTELLIGENCE: "commercial_intelligence",
  QUALITY_CONTROL: "quality_control",
  COMMERCIAL_EXPERIMENT: "commercial_experiment",
} as const;
export type CommercialDecisionSource =
  (typeof COMMERCIAL_DECISION_SOURCE)[keyof typeof COMMERCIAL_DECISION_SOURCE];

export type CommercialDecisionEvidence = Record<string, unknown>;

export const commercialDecisionWeeks = pgTable("commercial_decision_weeks", {
  weekStart: timestamp("week_start", { withTimezone: true }).primaryKey(),
  materializedAt: timestamp("materialized_at").defaultNow().notNull(),
});

export const commercialDecisions = pgTable(
  "commercial_decisions",
  {
    id: text("id").primaryKey(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    sourceType: text("source_type").$type<CommercialDecisionSource>().notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    scope: text("scope").notNull(),
    status: text("status")
      .$type<CommercialDecisionStatus>()
      .default(COMMERCIAL_DECISION_STATUS.PROPOSED)
      .notNull(),
    priority: text("priority").$type<CommercialDecisionPriority>().notNull(),
    rank: integer("rank").notNull(),
    evidence: json("evidence").$type<CommercialDecisionEvidence>().notNull(),
    estimatedImpactCents: integer("estimated_impact_cents"),
    confidencePercent: integer("confidence_percent"),
    sampleSize: integer("sample_size"),
    assignedToId: text("assigned_to_id").references(() => user.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("commercial_decisions_week_source_unique").on(
      table.weekStart,
      table.sourceFingerprint,
    ),
    uniqueIndex("commercial_decisions_week_rank_unique").on(
      table.weekStart,
      table.rank,
    ),
    index("commercial_decisions_week_priority_idx").on(
      table.weekStart,
      table.priority,
    ),
    check(
      "commercial_decisions_rank_check",
      sql`${table.rank} BETWEEN 1 AND 5`,
    ),
    check(
      "commercial_decisions_status_check",
      sql`${table.status} IN ('proposed', 'approved', 'rejected', 'in_progress', 'completed')`,
    ),
    check(
      "commercial_decisions_priority_check",
      sql`${table.priority} IN ('low', 'medium', 'high', 'critical')`,
    ),
    check(
      "commercial_decisions_confidence_check",
      sql`${table.confidencePercent} IS NULL OR ${table.confidencePercent} BETWEEN 0 AND 100`,
    ),
    check(
      "commercial_decisions_sample_size_check",
      sql`${table.sampleSize} IS NULL OR ${table.sampleSize} >= 0`,
    ),
  ],
);

export const commercialDecisionEvents = pgTable(
  "commercial_decision_events",
  {
    id: text("id").primaryKey(),
    decisionId: text("decision_id")
      .notNull()
      .references(() => commercialDecisions.id, { onDelete: "restrict" }),
    fromStatus: text("from_status").$type<CommercialDecisionStatus>(),
    toStatus: text("to_status").$type<CommercialDecisionStatus>().notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    note: text("note"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("commercial_decision_events_decision_time_idx").on(
      table.decisionId,
      table.occurredAt,
    ),
  ],
);

export const commercialDecisionsRelations = relations(
  commercialDecisions,
  ({ many, one }) => ({
    events: many(commercialDecisionEvents),
    assignedTo: one(user, {
      fields: [commercialDecisions.assignedToId],
      references: [user.id],
    }),
  }),
);

export const commercialDecisionEventsRelations = relations(
  commercialDecisionEvents,
  ({ one }) => ({
    decision: one(commercialDecisions, {
      fields: [commercialDecisionEvents.decisionId],
      references: [commercialDecisions.id],
    }),
    actor: one(user, {
      fields: [commercialDecisionEvents.actorId],
      references: [user.id],
    }),
  }),
);
