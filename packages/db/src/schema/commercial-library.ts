import { relations, sql } from "drizzle-orm";
import { check, index, integer, json, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { commercialExperiments } from "./commercial-experiments";

export const COMMERCIAL_LIBRARY_STATUS = { DRAFT: "draft", PUBLISHED: "published", ARCHIVED: "archived" } as const;
export const COMMERCIAL_LIBRARY_TYPE = { SCRIPT: "script", OBJECTION_RESPONSE: "objection_response", PLAYBOOK: "playbook", CASE_STUDY: "case_study" } as const;
export const COMMERCIAL_LIBRARY_CHANGE_KIND = { MANUAL: "manual", LEARNED: "learned", ROLLBACK: "rollback" } as const;
export type CommercialLibraryStatus = typeof COMMERCIAL_LIBRARY_STATUS[keyof typeof COMMERCIAL_LIBRARY_STATUS];
export type CommercialLibraryChangeKind = typeof COMMERCIAL_LIBRARY_CHANGE_KIND[keyof typeof COMMERCIAL_LIBRARY_CHANGE_KIND];
export type CommercialLibraryTargeting = { profile?: string | null; objections?: string[]; motivations?: string[]; source?: string | null; campaign?: string | null; ad?: string | null; creative?: string | null; acquisitionAngle?: string | null };
export type CommercialLibraryEvidence = { sampleSize?: number; conversionRate?: number; references?: { feedbackEventId: string; leadId: string }[]; evidenceLabel?: "observational" | "experiment_supported" };
export type StoredCommercialLibraryEvidence = Omit<CommercialLibraryEvidence, "evidenceLabel"> & { evidenceLabel?: CommercialLibraryEvidence["evidenceLabel"] | "causal" };

export const commercialLibraryVersions = pgTable("commercial_library_versions", {
  id: text("id").primaryKey(), lineageKey: text("lineage_key").notNull(), version: integer("version").notNull(),
  status: text("status").$type<CommercialLibraryStatus>().notNull(), type: text("type").notNull(), title: text("title").notNull(), content: text("content").notNull(),
  targeting: json("targeting").$type<CommercialLibraryTargeting>().default({}).notNull(), evidence: json("evidence").$type<StoredCommercialLibraryEvidence>().default({}).notNull(),
  parentVersionId: text("parent_version_id").references((): AnyPgColumn => commercialLibraryVersions.id, { onDelete: "restrict" }),
  changeKind: text("change_kind").$type<CommercialLibraryChangeKind>().default(COMMERCIAL_LIBRARY_CHANGE_KIND.MANUAL).notNull(),
  changeReason: text("change_reason"),
  restoredFromVersionId: text("restored_from_version_id").references((): AnyPgColumn => commercialLibraryVersions.id, { onDelete: "restrict" }),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }), approvedById: text("approved_by_id").references(() => user.id, { onDelete: "restrict" }), approvedAt: timestamp("approved_at"),
  originExperimentId: text("origin_experiment_id").references(() => commercialExperiments.id, { onDelete: "restrict" }), createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("commercial_library_lineage_version_uidx").on(table.lineageKey, table.version), index("commercial_library_status_type_idx").on(table.status, table.type), check("commercial_library_status_check", sql`${table.status} IN ('draft','published','archived')`), check("commercial_library_type_check", sql`${table.type} IN ('script','objection_response','playbook','case_study')`), check("commercial_library_version_check", sql`${table.version} >= 1`), check("commercial_library_change_kind_check", sql`${table.changeKind} IN ('manual','learned','rollback')`), check("commercial_library_rollback_source_check", sql`(${table.changeKind} = 'rollback' AND ${table.restoredFromVersionId} IS NOT NULL) OR (${table.changeKind} <> 'rollback' AND ${table.restoredFromVersionId} IS NULL)`)]);

export const commercialLibraryVersionsRelations = relations(commercialLibraryVersions, ({ one }) => ({
  actor: one(user, { fields: [commercialLibraryVersions.actorId], references: [user.id], relationName: "libraryActor" }),
  approvedBy: one(user, { fields: [commercialLibraryVersions.approvedById], references: [user.id], relationName: "libraryApprover" }),
  originExperiment: one(commercialExperiments, { fields: [commercialLibraryVersions.originExperimentId], references: [commercialExperiments.id] }),
  parentVersion: one(commercialLibraryVersions, { fields: [commercialLibraryVersions.parentVersionId], references: [commercialLibraryVersions.id], relationName: "libraryParentVersion" }),
  restoredFromVersion: one(commercialLibraryVersions, { fields: [commercialLibraryVersions.restoredFromVersionId], references: [commercialLibraryVersions.id], relationName: "libraryRestoredVersion" }),
}));
