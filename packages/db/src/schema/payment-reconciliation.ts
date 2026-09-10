import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leadFinancialEvents } from "./lead-financial-events";
import { leads } from "./leads";
import { receivableInstallments } from "./receivables";

export const paymentProviderProfiles = pgTable("payment_provider_profiles", {
  id: text("id").primaryKey(),
  providerKey: text("provider_key").notNull(),
  name: text("name").notNull(),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_provider_profiles_key_uidx").on(table.providerKey),
  check("payment_provider_profiles_key_check", sql`${table.providerKey} ~ '^[a-z0-9][a-z0-9_-]{1,79}$'`),
  check("payment_provider_profiles_name_check", sql`NULLIF(BTRIM(${table.name}), '') IS NOT NULL`),
]);

export const paymentReconciliationBatches = pgTable("payment_reconciliation_batches", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull().references(() => paymentProviderProfiles.id, { onDelete: "restrict" }),
  fileName: text("file_name").notNull(),
  contentHash: text("content_hash").notNull(),
  rowCount: integer("row_count").notNull(),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("payment_reconciliation_batches_profile_created_idx").on(table.profileId, table.createdAt),
  check("payment_reconciliation_batches_hash_check", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  check("payment_reconciliation_batches_rows_check", sql`${table.rowCount} > 0`),
]);

export const paymentReconciliations = pgTable("payment_reconciliations", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => paymentReconciliationBatches.id, { onDelete: "restrict" }),
  profileId: text("profile_id").notNull().references(() => paymentProviderProfiles.id, { onDelete: "restrict" }),
  externalReference: text("external_reference").notNull(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  financialEventId: text("financial_event_id").notNull().references(() => leadFinancialEvents.id, { onDelete: "restrict" }),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_reconciliations_profile_reference_uidx").on(table.profileId, table.externalReference),
  uniqueIndex("payment_reconciliations_event_uidx").on(table.financialEventId),
  index("payment_reconciliations_lead_occurred_idx").on(table.leadId, table.occurredAt),
  check("payment_reconciliations_amount_check", sql`${table.amountCents} > 0`),
  check("payment_reconciliations_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check("payment_reconciliations_reference_check", sql`NULLIF(BTRIM(${table.externalReference}), '') IS NOT NULL`),
]);

export const paymentReconciliationAllocations = pgTable("payment_reconciliation_allocations", {
  id: text("id").primaryKey(),
  reconciliationId: text("reconciliation_id").notNull().references(() => paymentReconciliations.id, { onDelete: "restrict" }),
  installmentId: text("installment_id").notNull().references(() => receivableInstallments.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_reconciliation_allocations_reconciliation_installment_uidx").on(table.reconciliationId, table.installmentId),
  check("payment_reconciliation_allocations_amount_check", sql`${table.amountCents} > 0`),
]);

export const paymentProviderProfileRelations = relations(paymentProviderProfiles, ({ many }) => ({
  batches: many(paymentReconciliationBatches),
  reconciliations: many(paymentReconciliations),
}));
