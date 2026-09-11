import { sql } from "drizzle-orm";
import { check, index, integer, json, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const WHATSAPP_CONSENT_STATUS = {
  GRANTED: "granted",
  REVOKED: "revoked",
} as const;

export const WHATSAPP_OUTBOX_STATUS = {
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  CANCELLED: "cancelled",
} as const;

export const WHATSAPP_MESSAGE_ORIGIN = {
  MANUAL: "manual",
  AI: "ai",
} as const;

export type WhatsappConsentEvidence = Readonly<{
  note: string;
  reference?: string;
}>;

export type WhatsappOutboxEventSnapshot = Readonly<{
  fromStatus?: string;
  toStatus: string;
  consentVersion?: number;
  reason?: string;
}>;

export const whatsappConsents = pgTable("whatsapp_consents", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  normalizedPhone: text("normalized_phone").notNull(),
  status: text("status").$type<(typeof WHATSAPP_CONSENT_STATUS)[keyof typeof WHATSAPP_CONSENT_STATUS]>().notNull(),
  source: text("source").notNull(),
  evidence: json("evidence").$type<WhatsappConsentEvidence>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedById: text("recorded_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_consents_phone_uidx").on(table.normalizedPhone),
  index("whatsapp_consents_lead_idx").on(table.leadId, table.status),
  check("whatsapp_consent_status_check", sql`${table.status} IN ('granted','revoked')`),
  check("whatsapp_consent_phone_check", sql`NULLIF(BTRIM(${table.normalizedPhone}), '') IS NOT NULL`),
  check("whatsapp_consent_source_check", sql`NULLIF(BTRIM(${table.source}), '') IS NOT NULL`),
  check("whatsapp_consent_version_check", sql`${table.version} >= 1`),
]);

export const whatsappConsentEvents = pgTable("whatsapp_consent_events", {
  id: text("id").primaryKey(),
  consentId: text("consent_id").notNull().references(() => whatsappConsents.id, { onDelete: "restrict" }),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  normalizedPhone: text("normalized_phone").notNull(),
  action: text("action").$type<"granted" | "revoked">().notNull(),
  source: text("source").notNull(),
  evidence: json("evidence").$type<WhatsappConsentEvidence>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  consentVersion: integer("consent_version").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("whatsapp_consent_events_consent_idx").on(table.consentId, table.consentVersion),
  index("whatsapp_consent_events_lead_idx").on(table.leadId, table.recordedAt),
  check("whatsapp_consent_event_action_check", sql`${table.action} IN ('granted','revoked')`),
  check("whatsapp_consent_event_version_check", sql`${table.consentVersion} >= 1`),
]);

export const whatsappOutboxMessages = pgTable("whatsapp_outbox_messages", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  normalizedRecipient: text("normalized_recipient").notNull(),
  consentId: text("consent_id").notNull().references(() => whatsappConsents.id, { onDelete: "restrict" }),
  consentVersion: integer("consent_version").notNull(),
  bodyText: text("body_text").notNull(),
  origin: text("origin").$type<"manual" | "ai">().notNull(),
  contextHash: text("context_hash"),
  status: text("status").$type<(typeof WHATSAPP_OUTBOX_STATUS)[keyof typeof WHATSAPP_OUTBOX_STATUS]>().notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  provider: text("provider").default("meta_whatsapp_cloud").notNull(),
  submittedById: text("submitted_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  approvedById: text("approved_by_id").references(() => user.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  cancelledById: text("cancelled_by_id").references(() => user.id, { onDelete: "restrict" }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_outbox_idempotency_uidx").on(table.idempotencyKey),
  index("whatsapp_outbox_lead_idx").on(table.leadId, table.createdAt),
  index("whatsapp_outbox_status_idx").on(table.status, table.createdAt),
  check("whatsapp_outbox_status_check", sql`${table.status} IN ('pending_approval','approved','cancelled')`),
  check("whatsapp_outbox_origin_check", sql`${table.origin} IN ('manual','ai')`),
  check("whatsapp_outbox_provider_check", sql`${table.provider} = 'meta_whatsapp_cloud'`),
  check("whatsapp_outbox_recipient_check", sql`NULLIF(BTRIM(${table.normalizedRecipient}), '') IS NOT NULL`),
  check("whatsapp_outbox_body_check", sql`char_length(BTRIM(${table.bodyText})) BETWEEN 1 AND 4000`),
  check("whatsapp_outbox_consent_version_check", sql`${table.consentVersion} >= 1`),
  check("whatsapp_outbox_idempotency_check", sql`NULLIF(BTRIM(${table.idempotencyKey}), '') IS NOT NULL`),
  check(
    "whatsapp_outbox_state_shape_check",
    sql`(${table.status} = 'pending_approval' AND ${table.approvedById} IS NULL AND ${table.approvedAt} IS NULL AND ${table.cancelledById} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'approved' AND ${table.approvedById} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND ${table.approvedById} <> ${table.submittedById} AND ${table.cancelledById} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'cancelled' AND ${table.approvedById} IS NULL AND ${table.approvedAt} IS NULL AND ${table.cancelledById} IS NOT NULL AND ${table.cancelledAt} IS NOT NULL)` ,
  ),
]);

export const whatsappOutboxEvents = pgTable("whatsapp_outbox_events", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => whatsappOutboxMessages.id, { onDelete: "restrict" }),
  action: text("action").$type<"submitted" | "approved" | "cancelled">().notNull(),
  actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  snapshot: json("snapshot").$type<WhatsappOutboxEventSnapshot>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("whatsapp_outbox_events_message_idx").on(table.messageId, table.occurredAt),
  check("whatsapp_outbox_event_action_check", sql`${table.action} IN ('submitted','approved','cancelled')`),
]);
