import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { leadFinancialEvents } from "./lead-financial-events";

describe("lead financial events schema", () => {
  it("stores immutable integer-cent facts with attribution and idempotency", () => {
    expect(leadFinancialEvents.leadId).toBeDefined();
    expect(leadFinancialEvents.amountCents).toBeDefined();
    expect(leadFinancialEvents.currency).toBeDefined();
    expect(leadFinancialEvents.occurredAt).toBeDefined();
    expect(leadFinancialEvents.createdById).toBeDefined();
    expect(leadFinancialEvents.idempotencyKey).toBeDefined();
    expect(leadFinancialEvents.reversalOfId).toBeDefined();
  });

  it("constrains kinds, positive amounts, currencies and one reversal per source", () => {
    const config = getTableConfig(leadFinancialEvents);
    expect(config.checks.map((item) => item.name)).toEqual(expect.arrayContaining([
      "lead_financial_events_kind_check",
      "lead_financial_events_amount_check",
      "lead_financial_events_currency_check",
      "lead_financial_events_reversal_shape_check",
    ]));
    expect(config.indexes.map((item) => item.config.name)).toEqual(expect.arrayContaining([
      "lead_financial_events_actor_idempotency_uidx",
      "lead_financial_events_reversal_of_uidx",
    ]));
  });

  it("generates append-only and reversal-integrity triggers", () => {
    const migration = readFileSync(
      new URL("../migrations/0026_lucky_liz_osborn.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain("lead_financial_events_append_only");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("lead_financial_events_validate_reversal");
    expect(migration).toContain("a reversal cannot reverse another reversal");
    expect(migration).toContain("reversal must copy source amount and currency");
  });
});
