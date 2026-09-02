import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const LEAD_FINANCIAL_EVENT_KIND = {
  CONTRACTED_SALE: "contracted_sale",
  DISCOUNT: "discount",
  PAYMENT_RECEIVED: "payment_received",
  REFUND: "refund",
  CHARGEBACK: "chargeback",
  COMMISSION: "commission",
  COST: "cost",
  REVERSAL: "reversal",
} as const;

export type LeadFinancialEventKind =
  (typeof LEAD_FINANCIAL_EVENT_KIND)[keyof typeof LEAD_FINANCIAL_EVENT_KIND];

export const leadFinancialEvents = pgTable(
  "lead_financial_events",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    kind: text("kind").$type<LeadFinancialEventKind>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    note: text("note"),
    externalReference: text("external_reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    reversalOfId: text("reversal_of_id").references(
      (): AnyPgColumn => leadFinancialEvents.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "lead_financial_events_kind_check",
      sql`${table.kind} IN ('contracted_sale', 'discount', 'payment_received', 'refund', 'chargeback', 'commission', 'cost', 'reversal')`,
    ),
    check(
      "lead_financial_events_amount_check",
      sql`${table.amountCents} > 0`,
    ),
    check(
      "lead_financial_events_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "lead_financial_events_reversal_shape_check",
      sql`(${table.kind} = 'reversal') = (${table.reversalOfId} IS NOT NULL)`,
    ),
    uniqueIndex("lead_financial_events_actor_idempotency_uidx").on(
      table.createdById,
      table.idempotencyKey,
    ),
    uniqueIndex("lead_financial_events_reversal_of_uidx").on(
      table.reversalOfId,
    ),
    index("lead_financial_events_lead_occurred_idx").on(
      table.leadId,
      table.occurredAt,
    ),
  ],
);

export const leadFinancialEventsRelations = relations(
  leadFinancialEvents,
  ({ one }) => ({
    lead: one(leads, {
      fields: [leadFinancialEvents.leadId],
      references: [leads.id],
    }),
    createdBy: one(user, {
      fields: [leadFinancialEvents.createdById],
      references: [user.id],
    }),
    reversalOf: one(leadFinancialEvents, {
      fields: [leadFinancialEvents.reversalOfId],
      references: [leadFinancialEvents.id],
      relationName: "financialEventReversal",
    }),
  }),
);
