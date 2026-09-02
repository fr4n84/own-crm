import { relations, sql } from "drizzle-orm";
import { check, index, integer, json, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { commercialExperiments } from "./commercial-experiments";
import { commercialLibraryVersions, type CommercialLibraryTargeting } from "./commercial-library";

export const COMMERCIAL_PLAYBOOK_PROPOSAL_STATUS = {
  DRAFT: "draft",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export const COMMERCIAL_PLAYBOOK_PROPOSAL_SOURCE = {
  OBSERVATIONAL_GAP: "observational_gap",
  APPROVED_EXPERIMENT: "approved_experiment",
} as const;

export type CommercialPlaybookProposalStatus = typeof COMMERCIAL_PLAYBOOK_PROPOSAL_STATUS[keyof typeof COMMERCIAL_PLAYBOOK_PROPOSAL_STATUS];
export type CommercialPlaybookProposalSource = typeof COMMERCIAL_PLAYBOOK_PROPOSAL_SOURCE[keyof typeof COMMERCIAL_PLAYBOOK_PROPOSAL_SOURCE];
export type CommercialPlaybookEvidenceSnapshot = {
  asOf: string;
  cutoff: string;
  cohortFingerprint: string;
  policyVersion: string;
  source: CommercialPlaybookProposalSource;
  maturityDays: number;
  windowDays: number;
  sampleSize: number;
  denominators: Record<string, number>;
  rates: Record<string, number>;
  confidence: "insufficient" | "observational" | "experiment_supported";
  confidenceInterval95: { lowerPp: number | null; upperPp: number | null; method: string } | null;
  evidenceIds: string[];
  evidenceLabel: "observational" | "experimental";
  limitations: string[];
};

export const commercialPlaybookProposalVersions = pgTable(
  "commercial_playbook_proposal_versions",
  {
    id: text("id").primaryKey(),
    lineageKey: text("lineage_key").notNull(),
    version: integer("version").notNull(),
    status: text("status").$type<CommercialPlaybookProposalStatus>().default(COMMERCIAL_PLAYBOOK_PROPOSAL_STATUS.DRAFT).notNull(),
    source: text("source").$type<CommercialPlaybookProposalSource>().notNull(),
    libraryLineageKey: text("library_lineage_key").notNull(),
    baseLibraryVersionId: text("base_library_version_id").references(() => commercialLibraryVersions.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    changeSummary: text("change_summary").notNull(),
    targeting: json("targeting").$type<CommercialLibraryTargeting>().default({}).notNull(),
    evidenceSnapshot: json("evidence_snapshot").$type<CommercialPlaybookEvidenceSnapshot>().notNull(),
    experimentSourceId: text("experiment_source_id").references(() => commercialExperiments.id, { onDelete: "restrict" }),
    publishedLibraryVersionId: text("published_library_version_id").references(() => commercialLibraryVersions.id, { onDelete: "restrict" }),
    actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    decisionById: text("decision_by_id").references(() => user.id, { onDelete: "restrict" }),
    decisionReason: text("decision_reason"),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("commercial_playbook_proposals_lineage_version_uidx").on(table.lineageKey, table.version),
    index("commercial_playbook_proposals_status_source_idx").on(table.status, table.source, table.createdAt),
    index("commercial_playbook_proposals_library_idx").on(table.libraryLineageKey, table.createdAt),
    check("commercial_playbook_proposals_status_check", sql`${table.status} IN ('draft','approved','rejected')`),
    check("commercial_playbook_proposals_source_check", sql`${table.source} IN ('observational_gap','approved_experiment')`),
    check("commercial_playbook_proposals_version_check", sql`${table.version} >= 1`),
    check("commercial_playbook_proposals_decision_check", sql`(${table.status} = 'draft' AND ${table.decisionById} IS NULL AND ${table.decisionReason} IS NULL AND ${table.decidedAt} IS NULL AND ${table.publishedLibraryVersionId} IS NULL) OR (${table.status} = 'approved' AND ${table.decisionById} IS NOT NULL AND ${table.decisionReason} IS NOT NULL AND ${table.decidedAt} IS NOT NULL AND ${table.publishedLibraryVersionId} IS NOT NULL) OR (${table.status} = 'rejected' AND ${table.decisionById} IS NOT NULL AND ${table.decisionReason} IS NOT NULL AND ${table.decidedAt} IS NOT NULL AND ${table.publishedLibraryVersionId} IS NULL)`),
    check("commercial_playbook_proposals_experiment_source_check", sql`(${table.source} = 'approved_experiment' AND ${table.experimentSourceId} IS NOT NULL) OR (${table.source} = 'observational_gap' AND ${table.experimentSourceId} IS NULL)`),
  ],
);

export const commercialPlaybookProposalVersionsRelations = relations(commercialPlaybookProposalVersions, ({ one }) => ({
  baseLibraryVersion: one(commercialLibraryVersions, { fields: [commercialPlaybookProposalVersions.baseLibraryVersionId], references: [commercialLibraryVersions.id], relationName: "playbookProposalBaseLibraryVersion" }),
  publishedLibraryVersion: one(commercialLibraryVersions, { fields: [commercialPlaybookProposalVersions.publishedLibraryVersionId], references: [commercialLibraryVersions.id], relationName: "playbookProposalPublishedLibraryVersion" }),
  experimentSource: one(commercialExperiments, { fields: [commercialPlaybookProposalVersions.experimentSourceId], references: [commercialExperiments.id] }),
  actor: one(user, { fields: [commercialPlaybookProposalVersions.actorId], references: [user.id], relationName: "playbookProposalActor" }),
  decisionBy: one(user, { fields: [commercialPlaybookProposalVersions.decisionById], references: [user.id], relationName: "playbookProposalDecisionActor" }),
}));
