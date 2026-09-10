import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leadFinancialEvents } from "./lead-financial-events";
import { leads } from "./leads";

export const SALE_PAYMENT_METHOD = {
  FULLPAY: "fullpay",
  FINANCED: "financed",
} as const;
export type SalePaymentMethod =
  (typeof SALE_PAYMENT_METHOD)[keyof typeof SALE_PAYMENT_METHOD];

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
    paymentMethod: text("payment_method").$type<SalePaymentMethod>(),
    financingProvider: text("financing_provider"),
    installmentMonths: integer("installment_months"),
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
    check(
      "closer_sale_records_payment_plan_check",
      sql`(${table.paymentMethod} IS NULL AND ${table.financingProvider} IS NULL AND ${table.installmentMonths} IS NULL) OR (${table.paymentMethod} = 'fullpay' AND ${table.financingProvider} IS NULL AND ${table.installmentMonths} IS NULL) OR (${table.paymentMethod} = 'financed' AND NULLIF(BTRIM(${table.financingProvider}), '') IS NOT NULL AND ${table.installmentMonths} BETWEEN 1 AND 600)`,
    ),
  ],
);

export type CloserSaleVoidSnapshot = {
  evidence: "confirmed" | "legacy_partial";
  saleAmountCents: number | null;
  amountPaidCents: number | null;
  currency: string | null;
  soldAt: string | null;
  paymentMethod: SalePaymentMethod | null;
  financingProvider: string | null;
  installmentMonths: number | null;
};

export const closerSaleVoids = pgTable(
  "closer_sale_voids",
  {
    leadId: text("lead_id")
      .primaryKey()
      .references(() => leads.id, { onDelete: "restrict" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    operationId: text("operation_id").notNull(),
    snapshot: jsonb("snapshot").$type<CloserSaleVoidSnapshot>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("closer_sale_voids_operation_uidx").on(table.operationId),
    check(
      "closer_sale_voids_reason_chk",
      sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`,
    ),
    check(
      "closer_sale_voids_operation_uuid_chk",
      sql`${table.operationId} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
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
