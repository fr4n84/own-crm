import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const campaignSpendPeriods = pgTable(
  "campaign_spend_periods",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    campaign: text("campaign").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    spendCents: integer("spend_cents").notNull(),
    referenceSaleValueCents: integer("reference_sale_value_cents").notNull(),
    currency: text("currency").default("EUR").notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "campaign_spend_periods_dates_check",
      sql`${table.periodEnd} >= ${table.periodStart}`,
    ),
    check(
      "campaign_spend_periods_spend_cents_check",
      sql`${table.spendCents} > 0`,
    ),
    check(
      "campaign_spend_periods_sale_value_cents_check",
      sql`${table.referenceSaleValueCents} > 0`,
    ),
    check(
      "campaign_spend_periods_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    index("campaign_spend_periods_campaign_dates_idx").on(
      table.source,
      table.campaign,
      table.periodStart,
      table.periodEnd,
    ),
    index("campaign_spend_periods_dates_idx").on(
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const campaignSpendPeriodsRelations = relations(
  campaignSpendPeriods,
  ({ one }) => ({
    createdBy: one(user, {
      fields: [campaignSpendPeriods.createdById],
      references: [user.id],
    }),
  }),
);
