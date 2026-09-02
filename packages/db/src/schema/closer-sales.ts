import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leadFinancialEvents } from "./lead-financial-events";
import { leads } from "./leads";

export const closerSaleRecords = pgTable(
  "closer_sale_records",
  {
    leadId: text("lead_id")
      .primaryKey()
      .references(() => leads.id, { onDelete: "cascade" }),
    contractStorageKey: text("contract_storage_key"),
    contractFileName: text("contract_file_name"),
    contractMimeType: text("contract_mime_type"),
    contractSizeBytes: integer("contract_size_bytes"),
    contractChecksum: text("contract_checksum"),
    salesCallUrl: text("sales_call_url"),
    saleAmountCents: integer("sale_amount_cents").notNull(),
    amountPaidCents: integer("amount_paid_cents").default(0).notNull(),
    currency: text("currency").default("EUR").notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    contractedSaleEventId: text("contracted_sale_event_id")
      .notNull()
      .references(() => leadFinancialEvents.id, { onDelete: "restrict" }),
    paymentReceivedEventId: text("payment_received_event_id")
      .references(() => leadFinancialEvents.id, { onDelete: "restrict" }),
    lastFinancialOperationId: text("last_financial_operation_id").notNull(),
    onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    onboardingVideoUrl: text("onboarding_video_url"),
    updatedById: text("updated_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "closer_sale_records_contract_shape_check",
      sql`(${table.contractStorageKey} IS NULL AND ${table.contractFileName} IS NULL AND ${table.contractMimeType} IS NULL AND ${table.contractSizeBytes} IS NULL AND ${table.contractChecksum} IS NULL) OR (${table.contractStorageKey} IS NOT NULL AND ${table.contractFileName} IS NOT NULL AND ${table.contractMimeType} IS NOT NULL AND ${table.contractSizeBytes} > 0 AND ${table.contractChecksum} IS NOT NULL)`,
    ),
    check(
      "closer_sale_records_amounts_check",
      sql`${table.saleAmountCents} > 0 AND ${table.amountPaidCents} >= 0 AND ${table.amountPaidCents} <= ${table.saleAmountCents}`,
    ),
    check(
      "closer_sale_records_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const closerSaleRecordsRelations = relations(closerSaleRecords, ({ one }) => ({
  lead: one(leads, {
    fields: [closerSaleRecords.leadId],
    references: [leads.id],
  }),
  updatedBy: one(user, {
    fields: [closerSaleRecords.updatedById],
    references: [user.id],
  }),
  contractedSaleEvent: one(leadFinancialEvents, {
    fields: [closerSaleRecords.contractedSaleEventId],
    references: [leadFinancialEvents.id],
    relationName: "closerSaleContractedEvent",
  }),
  paymentReceivedEvent: one(leadFinancialEvents, {
    fields: [closerSaleRecords.paymentReceivedEventId],
    references: [leadFinancialEvents.id],
    relationName: "closerSalePaymentEvent",
  }),
}));
