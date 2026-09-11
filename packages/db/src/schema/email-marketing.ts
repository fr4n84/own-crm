import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, json, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const EMAIL_MARKETING_PERMISSION_STATUS = { GRANTED: "granted", REVOKED: "revoked" } as const;
export const EMAIL_MARKETING_CAMPAIGN_STATUS = { DRAFT: "draft", READY: "ready" } as const;
export const EMAIL_MARKETING_COPY_STATUS = { DRAFT: "draft", APPROVED: "approved", RETIRED: "retired" } as const;
export const EMAIL_MARKETING_COPY_ORIGIN = { MANUAL: "manual", AI: "ai" } as const;
export const EMAIL_MARKETING_AUDIENCE_DECISION = { INCLUDED: "included", EXCLUDED: "excluded" } as const;
export const EMAIL_MARKETING_AUDIENCE_REASON = {
  ELIGIBLE: "eligible", MISSING_NORMALIZED_EMAIL: "missing_normalized_email", NO_ACTIVE_CONSENT: "no_active_consent",
  SUPPRESSED: "suppressed", DUPLICATE_NORMALIZED_EMAIL: "duplicate_normalized_email",
} as const;

export type EmailMarketingEvidence = { reference?: string; note: string };
export type EmailMarketingSegmentCriteria = { combine: "union" | "intersection" | "exclusion"; groups: Array<{ sources?: string[]; campaigns?: string[]; utmContents?: string[]; themes?: string[]; confirmedFeedback?: string[] }> };
export type EmailMarketingExportExclusions = { missing: number; revoked: number; suppressed: number; duplicate: number };
export type EmailMarketingAudienceEvidence = {
  permissionId?: string; permissionVersion?: number; permissionSource?: string; permissionOccurredAt?: string;
  suppressionId?: string; suppressionVersion?: number; suppressionSource?: string; suppressionOccurredAt?: string;
  anonymized?: true; policyVersion: string;
};

export const emailMarketingPermissions = pgTable("email_marketing_permissions", {
  id: text("id").primaryKey(), normalizedEmail: text("normalized_email").notNull(), leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  status: text("status").$type<(typeof EMAIL_MARKETING_PERMISSION_STATUS)[keyof typeof EMAIL_MARKETING_PERMISSION_STATUS]>().notNull(),
  source: text("source").notNull(), evidence: json("evidence").$type<EmailMarketingEvidence>().notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedById: text("recorded_by_id").notNull().references(() => user.id, { onDelete: "restrict" }), version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_marketing_permissions_email_uidx").on(table.normalizedEmail), index("email_marketing_permissions_status_idx").on(table.status, table.normalizedEmail),
  check("email_marketing_permission_status_check", sql`${table.status} IN ('granted','revoked')`),
  check("email_marketing_permission_email_check", sql`${table.normalizedEmail} = LOWER(BTRIM(${table.normalizedEmail})) AND NULLIF(BTRIM(${table.normalizedEmail}), '') IS NOT NULL`),
  check("email_marketing_permission_version_check", sql`${table.version} >= 1`), check("email_marketing_permission_source_check", sql`NULLIF(BTRIM(${table.source}), '') IS NOT NULL`),
]);

export const emailMarketingPermissionEvents = pgTable("email_marketing_permission_events", {
  id: text("id").primaryKey(), permissionId: text("permission_id").notNull().references(() => emailMarketingPermissions.id, { onDelete: "restrict" }),
  normalizedEmail: text("normalized_email").notNull(), leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }), action: text("action").notNull(),
  source: text("source").notNull(), evidence: json("evidence").$type<EmailMarketingEvidence>().notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }), permissionVersion: integer("permission_version").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("email_marketing_permission_events_email_idx").on(table.normalizedEmail, table.recordedAt), index("email_marketing_permission_events_permission_idx").on(table.permissionId, table.permissionVersion),
  check("email_marketing_permission_event_action_check", sql`${table.action} IN ('granted','revoked')`), check("email_marketing_permission_event_version_check", sql`${table.permissionVersion} >= 1`),
]);

export const emailMarketingSuppressions = pgTable("email_marketing_suppressions", {
  id: text("id").primaryKey(), normalizedEmail: text("normalized_email").notNull(), active: boolean("active").default(true).notNull(), reason: text("reason").notNull(),
  source: text("source").notNull(), evidence: json("evidence").$type<EmailMarketingEvidence>().notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  suppressedById: text("suppressed_by_id").notNull().references(() => user.id, { onDelete: "restrict" }), liftedAt: timestamp("lifted_at", { withTimezone: true }),
  liftedById: text("lifted_by_id").references(() => user.id, { onDelete: "restrict" }), liftReason: text("lift_reason"), version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_marketing_suppressions_email_uidx").on(table.normalizedEmail), index("email_marketing_suppressions_active_idx").on(table.active, table.normalizedEmail),
  check("email_marketing_suppression_email_check", sql`${table.normalizedEmail} = LOWER(BTRIM(${table.normalizedEmail})) AND NULLIF(BTRIM(${table.normalizedEmail}), '') IS NOT NULL`),
  check("email_marketing_suppression_version_check", sql`${table.version} >= 1`),
  check("email_marketing_suppression_shape_check", sql`(${table.active} AND ${table.liftedAt} IS NULL AND ${table.liftedById} IS NULL AND ${table.liftReason} IS NULL) OR (NOT ${table.active} AND ${table.liftedAt} IS NOT NULL AND ${table.liftedById} IS NOT NULL AND NULLIF(BTRIM(${table.liftReason}), '') IS NOT NULL)`),
]);

export const emailMarketingSuppressionEvents = pgTable("email_marketing_suppression_events", {
  id: text("id").primaryKey(), suppressionId: text("suppression_id").notNull().references(() => emailMarketingSuppressions.id, { onDelete: "restrict" }), normalizedEmail: text("normalized_email").notNull(),
  action: text("action").notNull(), reason: text("reason").notNull(), source: text("source").notNull(), evidence: json("evidence").$type<EmailMarketingEvidence>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  suppressionVersion: integer("suppression_version").notNull(), recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("email_marketing_suppression_events_email_idx").on(table.normalizedEmail, table.recordedAt), check("email_marketing_suppression_event_action_check", sql`${table.action} IN ('suppressed','lifted')`),
  check("email_marketing_suppression_event_version_check", sql`${table.suppressionVersion} >= 1`),
]);

export const emailMarketingCampaigns = pgTable("email_marketing_campaigns", {
  id: text("id").primaryKey(), name: text("name").notNull(), status: text("status").$type<(typeof EMAIL_MARKETING_CAMPAIGN_STATUS)[keyof typeof EMAIL_MARKETING_CAMPAIGN_STATUS]>().default(EMAIL_MARKETING_CAMPAIGN_STATUS.DRAFT).notNull(),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("email_marketing_campaigns_status_idx").on(table.status, table.updatedAt), check("email_marketing_campaign_status_check", sql`${table.status} IN ('draft','ready')`),
  check("email_marketing_campaign_name_check", sql`NULLIF(BTRIM(${table.name}), '') IS NOT NULL`),
]);

export const emailMarketingContentVersions = pgTable("email_marketing_content_versions", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull().references(() => emailMarketingCampaigns.id, { onDelete: "restrict" }), version: integer("version").notNull(),
  subject: text("subject").notNull(), previewText: text("preview_text"), bodyText: text("body_text").notNull(),
  origin: text("origin").$type<"manual" | "ai">().default("manual").notNull(), contextHash: text("context_hash"),
  status: text("status").$type<(typeof EMAIL_MARKETING_COPY_STATUS)[keyof typeof EMAIL_MARKETING_COPY_STATUS]>().default(EMAIL_MARKETING_COPY_STATUS.DRAFT).notNull(),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }), approvedById: text("approved_by_id").references(() => user.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_marketing_content_campaign_version_uidx").on(table.campaignId, table.version), uniqueIndex("email_marketing_content_one_approved_uidx").on(table.campaignId).where(sql`${table.status} = 'approved'`),
  index("email_marketing_content_campaign_idx").on(table.campaignId, table.createdAt), check("email_marketing_content_version_check", sql`${table.version} >= 1`),
  check("email_marketing_content_status_check", sql`${table.status} IN ('draft','approved','retired')`),
  check("email_marketing_content_origin_check", sql`${table.origin} IN ('manual','ai')`),
  check("email_marketing_content_ai_review_check", sql`${table.origin} <> 'ai' OR ${table.approvedById} IS NULL OR ${table.approvedById} <> ${table.createdById}`),
  check("email_marketing_content_approval_shape_check", sql`(${table.status} = 'draft' AND ${table.approvedById} IS NULL AND ${table.approvedAt} IS NULL) OR (${table.status} IN ('approved','retired') AND ${table.approvedById} IS NOT NULL AND ${table.approvedAt} IS NOT NULL)`),
  check("email_marketing_content_subject_check", sql`NULLIF(BTRIM(${table.subject}), '') IS NOT NULL`), check("email_marketing_content_body_check", sql`NULLIF(BTRIM(${table.bodyText}), '') IS NOT NULL`),
]);

export const emailMarketingAudienceSnapshots = pgTable("email_marketing_audience_snapshots", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull().references(() => emailMarketingCampaigns.id, { onDelete: "restrict" }), version: integer("version").notNull(),
  sourceKind: text("source_kind").default("all_unmerged_leads").notNull(), policyVersion: text("policy_version").default("email-marketing-v1").notNull(),
  criteria: json("criteria").$type<EmailMarketingSegmentCriteria>(),
  candidateCount: integer("candidate_count").notNull(), includedCount: integer("included_count").notNull(), createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_marketing_audience_campaign_version_uidx").on(table.campaignId, table.version), index("email_marketing_audience_campaign_idx").on(table.campaignId, table.createdAt),
  check("email_marketing_audience_source_check", sql`${table.sourceKind} = 'all_unmerged_leads'`), check("email_marketing_audience_counts_check", sql`${table.candidateCount} >= 0 AND ${table.includedCount} >= 0 AND ${table.includedCount} <= ${table.candidateCount}`),
]);

export const emailMarketingAudienceMembers = pgTable("email_marketing_audience_members", {
  id: text("id").primaryKey(), snapshotId: text("snapshot_id").notNull().references(() => emailMarketingAudienceSnapshots.id, { onDelete: "restrict" }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  decision: text("decision").$type<(typeof EMAIL_MARKETING_AUDIENCE_DECISION)[keyof typeof EMAIL_MARKETING_AUDIENCE_DECISION]>().notNull(),
  reason: text("reason").$type<(typeof EMAIL_MARKETING_AUDIENCE_REASON)[keyof typeof EMAIL_MARKETING_AUDIENCE_REASON]>().notNull(),
  evidence: json("evidence").$type<EmailMarketingAudienceEvidence>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_marketing_audience_member_snapshot_lead_uidx").on(table.snapshotId, table.leadId), index("email_marketing_audience_member_decision_idx").on(table.snapshotId, table.decision), check("email_marketing_audience_decision_check", sql`${table.decision} IN ('included','excluded')`),
  check("email_marketing_audience_reason_check", sql`${table.reason} IN ('eligible','missing_normalized_email','no_active_consent','suppressed','duplicate_normalized_email')`),
  check("email_marketing_audience_member_shape_check", sql`(${table.decision} = 'included' AND ${table.reason} = 'eligible' AND (${table.leadId} IS NOT NULL OR ${table.evidence}->>'anonymized' = 'true')) OR (${table.decision} = 'excluded' AND ${table.reason} <> 'eligible')`),
]);

export const emailMarketingExportAudits = pgTable("email_marketing_export_audits", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull().references(() => emailMarketingAudienceSnapshots.id, { onDelete: "restrict" }),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  purpose: text("purpose").notNull(),
  contentHash: text("content_hash").notNull(),
  exportedCount: integer("exported_count").notNull(),
  exclusions: json("exclusions").$type<EmailMarketingExportExclusions>().notNull(),
  operationId: text("operation_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_marketing_export_operation_uidx").on(table.operationId),
  index("email_marketing_export_snapshot_idx").on(table.snapshotId, table.occurredAt),
  check("email_marketing_export_purpose_check", sql`char_length(btrim(${table.purpose})) BETWEEN 1 AND 500`),
  check("email_marketing_export_count_check", sql`${table.exportedCount} >= 0`),
]);
export const emailMarketingCampaignRelations = relations(emailMarketingCampaigns, ({ many, one }) => ({
  creator: one(user, { fields: [emailMarketingCampaigns.createdById], references: [user.id] }), contentVersions: many(emailMarketingContentVersions), audienceSnapshots: many(emailMarketingAudienceSnapshots),
}));
export const emailMarketingContentRelations = relations(emailMarketingContentVersions, ({ one }) => ({
  campaign: one(emailMarketingCampaigns, { fields: [emailMarketingContentVersions.campaignId], references: [emailMarketingCampaigns.id] }),
  creator: one(user, { fields: [emailMarketingContentVersions.createdById], references: [user.id], relationName: "emailMarketingContentCreator" }),
  approver: one(user, { fields: [emailMarketingContentVersions.approvedById], references: [user.id], relationName: "emailMarketingContentApprover" }),
}));
export const emailMarketingAudienceSnapshotRelations = relations(emailMarketingAudienceSnapshots, ({ many, one }) => ({
  campaign: one(emailMarketingCampaigns, { fields: [emailMarketingAudienceSnapshots.campaignId], references: [emailMarketingCampaigns.id] }),
  creator: one(user, { fields: [emailMarketingAudienceSnapshots.createdById], references: [user.id] }), members: many(emailMarketingAudienceMembers),
}));
export const emailMarketingAudienceMemberRelations = relations(emailMarketingAudienceMembers, ({ one }) => ({
  snapshot: one(emailMarketingAudienceSnapshots, { fields: [emailMarketingAudienceMembers.snapshotId], references: [emailMarketingAudienceSnapshots.id] }),
  lead: one(leads, { fields: [emailMarketingAudienceMembers.leadId], references: [leads.id] }),
}));
