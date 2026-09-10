import { relations, sql } from "drizzle-orm";
import { check, index, integer, json, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const LEAD_DUPLICATE_STATUS = {
  OPEN: "open",
  MERGED: "merged",
  DISMISSED: "dismissed",
} as const;

export type LeadDuplicateStatus =
  (typeof LEAD_DUPLICATE_STATUS)[keyof typeof LEAD_DUPLICATE_STATUS];

export type LeadDuplicateReason = "exact_email" | "exact_phone" | "similar_name";

export const leadDuplicateCases = pgTable("lead_duplicate_cases", {
  id: text("id").primaryKey(),
  leadAId: text("lead_a_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  leadBId: text("lead_b_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  reasons: json("reasons").$type<LeadDuplicateReason[]>().notNull(),
  nameSimilarity: integer("name_similarity").notNull(),
  status: text("status").$type<LeadDuplicateStatus>().default(LEAD_DUPLICATE_STATUS.OPEN).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedById: text("resolved_by_id").references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("lead_duplicate_cases_pair_uidx").on(table.leadAId, table.leadBId),
  index("lead_duplicate_cases_status_idx").on(table.status, table.createdAt),
  check("lead_duplicate_cases_distinct_check", sql`${table.leadAId} < ${table.leadBId}`),
  check("lead_duplicate_cases_similarity_check", sql`${table.nameSimilarity} BETWEEN 0 AND 100`),
  check("lead_duplicate_cases_status_check", sql`${table.status} IN ('open','merged','dismissed')`),
]);

export const leadMergeAudit = pgTable("lead_merge_audit", {
  id: text("id").primaryKey(),
  sourceLeadId: text("source_lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  canonicalLeadId: text("canonical_lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  duplicateCaseId: text("duplicate_case_id").notNull().references(() => leadDuplicateCases.id, { onDelete: "restrict" }),
  snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("lead_merge_audit_source_idx").on(table.sourceLeadId),
  index("lead_merge_audit_canonical_idx").on(table.canonicalLeadId),
]);

export const leadAliases = pgTable("lead_aliases", {
  aliasLeadId: text("alias_lead_id").primaryKey().references(() => leads.id, { onDelete: "restrict" }),
  canonicalLeadId: text("canonical_lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  mergeAuditId: text("merge_audit_id").notNull().references(() => leadMergeAudit.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("lead_aliases_canonical_idx").on(table.canonicalLeadId)]);

export const leadDuplicateCaseRelations = relations(leadDuplicateCases, ({ one }) => ({
  leadA: one(leads, { fields: [leadDuplicateCases.leadAId], references: [leads.id], relationName: "duplicateLeadA" }),
  leadB: one(leads, { fields: [leadDuplicateCases.leadBId], references: [leads.id], relationName: "duplicateLeadB" }),
}));
