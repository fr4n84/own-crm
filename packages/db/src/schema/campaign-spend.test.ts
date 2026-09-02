import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { campaignSpendPeriods } from "./campaign-spend";

describe("campaign spend schema", () => {
  it("stores auditable manual spend and reference sale value", () => {
    expect(campaignSpendPeriods.source).toBeDefined();
    expect(campaignSpendPeriods.campaign).toBeDefined();
    expect(campaignSpendPeriods.periodStart).toBeDefined();
    expect(campaignSpendPeriods.periodEnd).toBeDefined();
    expect(campaignSpendPeriods.spendCents).toBeDefined();
    expect(campaignSpendPeriods.referenceSaleValueCents).toBeDefined();
    expect(campaignSpendPeriods.currency).toBeDefined();
    expect(campaignSpendPeriods.createdById).toBeDefined();
  });

  it("declares positive-value checks and campaign-period indexes", () => {
    const config = getTableConfig(campaignSpendPeriods);

    expect(config.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "campaign_spend_periods_dates_check",
      "campaign_spend_periods_spend_cents_check",
      "campaign_spend_periods_sale_value_cents_check",
    ]));
    expect(config.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining([
      "campaign_spend_periods_campaign_dates_idx",
      "campaign_spend_periods_dates_idx",
    ]));
  });
});
