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
import { leads, type LeadType } from "./leads";

export const COMMERCIAL_EXPERIMENT_INTERVENTION_TYPE = {
  ASSIGNMENT_ROUTING: "assignment_routing",
  SPEED_PRIORITY: "speed_priority",
  FOLLOW_UP_CADENCE: "follow_up_cadence",
  NEXT_BEST_ACTION: "next_best_action",
} as const;
export type CommercialExperimentInterventionType = (typeof COMMERCIAL_EXPERIMENT_INTERVENTION_TYPE)[keyof typeof COMMERCIAL_EXPERIMENT_INTERVENTION_TYPE];

export const COMMERCIAL_EXPERIMENT_PRIMARY_METRIC = {
  CONTACTED: "contacted",
  APPOINTMENT: "appointment",
  SHOW: "show",
  SALE: "sale",
} as const;
export type CommercialExperimentPrimaryMetric = (typeof COMMERCIAL_EXPERIMENT_PRIMARY_METRIC)[keyof typeof COMMERCIAL_EXPERIMENT_PRIMARY_METRIC];

export const COMMERCIAL_EXPERIMENT_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  STOPPED: "stopped",
  COMPLETED: "completed",
} as const;
export type CommercialExperimentStatus = (typeof COMMERCIAL_EXPERIMENT_STATUS)[keyof typeof COMMERCIAL_EXPERIMENT_STATUS];

export const COMMERCIAL_EXPERIMENT_ARM = {
  CONTROL: "control",
  TREATMENT: "treatment",
} as const;
export type CommercialExperimentArm = (typeof COMMERCIAL_EXPERIMENT_ARM)[keyof typeof COMMERCIAL_EXPERIMENT_ARM];

export const COMMERCIAL_EXPERIMENT_FINAL_DECISION = {
  INCONCLUSIVE: "inconclusive",
  REJECTED: "rejected",
  APPROVED: "approved",
} as const;
export type CommercialExperimentFinalDecision = (typeof COMMERCIAL_EXPERIMENT_FINAL_DECISION)[keyof typeof COMMERCIAL_EXPERIMENT_FINAL_DECISION];

export type CommercialExperimentEligibility = {
  profiles?: string[];
  sources?: string[];
  campaigns?: string[];
  types?: LeadType[];
};

export type CommercialExperimentTreatmentConfig = Record<string, unknown>;
export type CommercialExperimentTreatmentInstructions = Record<string, unknown>;

export type CommercialExperimentFrozenContext = {
  profile: string | null;
  source: string | null;
  campaign: string | null;
  type: LeadType;
  originalCallerId: string | null;
  originalCloserId: string | null;
  leadCreatedAt: string;
  enrolledAt: string;
  recommendedCallerId: string | null;
  recommendedCloserId: string | null;
};

export const commercialExperiments = pgTable(
  "commercial_experiments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    hypothesis: text("hypothesis").notNull(),
    interventionType: text("intervention_type").$type<CommercialExperimentInterventionType>().notNull(),
    primaryMetric: text("primary_metric").$type<CommercialExperimentPrimaryMetric>().notNull(),
    status: text("status").$type<CommercialExperimentStatus>().default(COMMERCIAL_EXPERIMENT_STATUS.DRAFT).notNull(),
    eligibility: json("eligibility").$type<CommercialExperimentEligibility>(),
    treatmentConfig: json("treatment_config").$type<CommercialExperimentTreatmentConfig>().default({}).notNull(),
    treatmentInstructions: json("treatment_instructions").$type<CommercialExperimentTreatmentInstructions>().default({}).notNull(),
    allocationPercent: integer("allocation_percent").notNull(),
    minimumSamplePerArm: integer("minimum_sample_per_arm").notNull(),
    maturationDays: integer("maturation_days").notNull(),
    guardrailTolerancePp: integer("guardrail_tolerance_pp").notNull(),
    createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    finalDecision: text("final_decision").$type<CommercialExperimentFinalDecision>(),
    finalDecisionById: text("final_decision_by_id").references(() => user.id, { onDelete: "set null" }),
    finalDecisionAt: timestamp("final_decision_at"),
    finalDecisionNotes: text("final_decision_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("commercial_experiments_status_intervention_idx").on(table.status, table.interventionType),
    index("commercial_experiments_created_by_idx").on(table.createdById),
    check("commercial_experiments_allocation_percent_check", sql`${table.allocationPercent} BETWEEN 0 AND 100`),
    check("commercial_experiments_minimum_sample_per_arm_check", sql`${table.minimumSamplePerArm} >= 1`),
    check("commercial_experiments_maturation_days_check", sql`${table.maturationDays} >= 0`),
    check("commercial_experiments_guardrail_tolerance_pp_check", sql`${table.guardrailTolerancePp} >= 0`),
    check("commercial_experiments_intervention_type_check", sql`${table.interventionType} IN ('assignment_routing', 'speed_priority', 'follow_up_cadence', 'next_best_action')`),
    check("commercial_experiments_primary_metric_check", sql`${table.primaryMetric} IN ('contacted', 'appointment', 'show', 'sale')`),
    check("commercial_experiments_status_check", sql`${table.status} IN ('draft', 'active', 'stopped', 'completed')`),
    check("commercial_experiments_final_decision_check", sql`${table.finalDecision} IN ('inconclusive', 'rejected', 'approved')`),
  ],
);

export const commercialExperimentAssignments = pgTable(
  "commercial_experiment_assignments",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id").notNull().references(() => commercialExperiments.id, { onDelete: "cascade" }),
    leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    arm: text("arm").$type<CommercialExperimentArm>().notNull(),
    enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
    frozenContext: json("frozen_context").$type<CommercialExperimentFrozenContext>().notNull(),
    treatmentAppliedAt: timestamp("treatment_applied_at"),
    treatmentAppliedById: text("treatment_applied_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("commercial_experiment_assignments_experiment_lead_unique").on(table.experimentId, table.leadId),
    index("commercial_experiment_assignments_experiment_arm_enrolled_idx").on(table.experimentId, table.arm, table.enrolledAt),
    index("commercial_experiment_assignments_lead_idx").on(table.leadId),
    check("commercial_experiment_assignments_arm_check", sql`${table.arm} IN ('control', 'treatment')`),
  ],
);

export const commercialExperimentsRelations = relations(commercialExperiments, ({ many, one }) => ({
  assignments: many(commercialExperimentAssignments),
  createdBy: one(user, { fields: [commercialExperiments.createdById], references: [user.id], relationName: "commercialExperimentCreator" }),
  finalDecisionBy: one(user, { fields: [commercialExperiments.finalDecisionById], references: [user.id], relationName: "commercialExperimentDecisionActor" }),
}));

export const commercialExperimentAssignmentsRelations = relations(commercialExperimentAssignments, ({ one }) => ({
  experiment: one(commercialExperiments, { fields: [commercialExperimentAssignments.experimentId], references: [commercialExperiments.id] }),
  lead: one(leads, { fields: [commercialExperimentAssignments.leadId], references: [leads.id] }),
  treatmentAppliedBy: one(user, { fields: [commercialExperimentAssignments.treatmentAppliedById], references: [user.id], relationName: "commercialExperimentTreatmentActor" }),
}));