import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { leadFinancialEvents } from "./lead-financial-events";
import { leads } from "./leads";
import { user } from "./auth";

export const receivableAccounts = pgTable("receivable_accounts", {
  leadId: text("lead_id").primaryKey().references(() => leads.id, { onDelete: "restrict" }),
  currency: text("currency").notNull(),
  contractedAmountCents: integer("contracted_amount_cents").notNull(),
  activeScheduleVersion: integer("active_schedule_version").default(1).notNull(),
  updatedById: text("updated_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("receivable_accounts_amount_check", sql`${table.contractedAmountCents} > 0`),
  check("receivable_accounts_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check("receivable_accounts_version_check", sql`${table.activeScheduleVersion} >= 1`),
]);

export const receivableInstallments = pgTable("receivable_installments", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => receivableAccounts.leadId, { onDelete: "restrict" }),
  scheduleVersion: integer("schedule_version").notNull(),
  sequence: integer("sequence").notNull(),
  dueOn: text("due_on").notNull(),
  expectedAmountCents: integer("expected_amount_cents").notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("receivable_installments_schedule_sequence_uidx").on(table.leadId, table.scheduleVersion, table.sequence),
  index("receivable_installments_due_idx").on(table.dueOn),
  check("receivable_installments_amount_check", sql`${table.expectedAmountCents} > 0`),
  check("receivable_installments_sequence_check", sql`${table.scheduleVersion} >= 1 AND ${table.sequence} >= 1`),
  check("receivable_installments_due_check", sql`${table.dueOn} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
]);

export const receivablePaymentAllocations = pgTable("receivable_payment_allocations", {
  id: text("id").primaryKey(),
  installmentId: text("installment_id").notNull().references(() => receivableInstallments.id, { onDelete: "restrict" }),
  financialEventId: text("financial_event_id").notNull().references(() => leadFinancialEvents.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("receivable_payment_allocations_event_installment_uidx").on(table.financialEventId, table.installmentId),
  index("receivable_payment_allocations_installment_idx").on(table.installmentId),
  check("receivable_payment_allocations_amount_check", sql`${table.amountCents} > 0`),
]);

export const receivableAccountRelations = relations(receivableAccounts, ({ one, many }) => ({
  lead: one(leads, { fields: [receivableAccounts.leadId], references: [leads.id] }),
  installments: many(receivableInstallments),
}));
