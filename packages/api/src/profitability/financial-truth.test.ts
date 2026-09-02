import { describe, expect, it } from "vitest";

import { buildFinancialTruthProjection } from "./financial-truth";

const at = new Date("2026-08-24T10:00:00.000Z");

describe("buildFinancialTruthProjection", () => {
  it("projects real financial facts independently for each currency", () => {
    const result = buildFinancialTruthProjection([
      { id: "sale-eur", kind: "contracted_sale", amountCents: 200_000, currency: "EUR", reversalOfId: null, occurredAt: at },
      { id: "discount-eur", kind: "discount", amountCents: 10_000, currency: "EUR", reversalOfId: null, occurredAt: at },
      { id: "payment-eur", kind: "payment_received", amountCents: 80_000, currency: "EUR", reversalOfId: null, occurredAt: at },
      { id: "refund-eur", kind: "refund", amountCents: 5_000, currency: "EUR", reversalOfId: null, occurredAt: at },
      { id: "commission-eur", kind: "commission", amountCents: 8_000, currency: "EUR", reversalOfId: null, occurredAt: at },
      { id: "cost-eur", kind: "cost", amountCents: 2_000, currency: "EUR", reversalOfId: null, occurredAt: at },
      { id: "sale-usd", kind: "contracted_sale", amountCents: 300_000, currency: "USD", reversalOfId: null, occurredAt: at },
    ]);

    expect(result).toEqual([
      expect.objectContaining({ currency: "EUR", grossContractedCents: 200_000, discountsCents: 10_000, netContractedCents: 190_000, paymentsCents: 80_000, refundsAndChargebacksCents: 5_000, realizedCashCents: 75_000, commissionsCents: 8_000, directCostsCents: 2_000, realizedMarginBeforeAdsCents: 65_000, outstandingContractedBalanceCents: 115_000 }),
      expect.objectContaining({ currency: "USD", grossContractedCents: 300_000, netContractedCents: 300_000, outstandingContractedBalanceCents: 300_000 }),
    ]);
  });

  it("neutralizes an original event and its reversal exactly", () => {
    const result = buildFinancialTruthProjection([
      { id: "payment", kind: "payment_received", amountCents: 50_000, currency: "EUR", reversalOfId: null, occurredAt: at },
      { id: "reversal", kind: "reversal", amountCents: 50_000, currency: "EUR", reversalOfId: "payment", occurredAt: at },
    ]);

    expect(result).toEqual([]);
  });
});
