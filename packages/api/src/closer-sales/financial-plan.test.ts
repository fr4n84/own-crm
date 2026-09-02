import { describe, expect, it } from "vitest";

import { buildSaleFinancialPlan } from "./financial-plan";

const soldAt = new Date("2026-09-01T12:00:00.000Z");

describe("closer sale financial plan", () => {
  it("creates contracted and collected events for a new paid sale", () => {
    expect(buildSaleFinancialPlan(null, {
      saleAmountCents: 3_000_00,
      amountPaidCents: 1_000_00,
      currency: "EUR",
      soldAt,
    })).toEqual({
      reverseContractedSaleEventId: null,
      reversePaymentReceivedEventId: null,
      createContractedSale: true,
      createPaymentReceived: true,
    });
  });

  it("does nothing when the financial truth did not change", () => {
    expect(buildSaleFinancialPlan({
      saleAmountCents: 3_000_00,
      amountPaidCents: 1_000_00,
      currency: "EUR",
      soldAt,
      contractedSaleEventId: "contracted-1",
      paymentReceivedEventId: "payment-1",
    }, {
      saleAmountCents: 3_000_00,
      amountPaidCents: 1_000_00,
      currency: "EUR",
      soldAt: new Date(soldAt),
    })).toEqual({
      reverseContractedSaleEventId: null,
      reversePaymentReceivedEventId: null,
      createContractedSale: false,
      createPaymentReceived: false,
    });
  });

  it("only replaces the collected event when the amount paid changes", () => {
    expect(buildSaleFinancialPlan({
      saleAmountCents: 3_000_00,
      amountPaidCents: 1_000_00,
      currency: "EUR",
      soldAt,
      contractedSaleEventId: "contracted-1",
      paymentReceivedEventId: "payment-1",
    }, {
      saleAmountCents: 3_000_00,
      amountPaidCents: 2_000_00,
      currency: "EUR",
      soldAt,
    })).toEqual({
      reverseContractedSaleEventId: null,
      reversePaymentReceivedEventId: "payment-1",
      createContractedSale: false,
      createPaymentReceived: true,
    });
  });

  it("replaces both facts when the contracted amount changes", () => {
    expect(buildSaleFinancialPlan({
      saleAmountCents: 3_000_00,
      amountPaidCents: 1_000_00,
      currency: "EUR",
      soldAt,
      contractedSaleEventId: "contracted-1",
      paymentReceivedEventId: "payment-1",
    }, {
      saleAmountCents: 4_000_00,
      amountPaidCents: 1_000_00,
      currency: "EUR",
      soldAt,
    })).toEqual({
      reverseContractedSaleEventId: "contracted-1",
      reversePaymentReceivedEventId: "payment-1",
      createContractedSale: true,
      createPaymentReceived: true,
    });
  });

  it("does not create a payment event while nothing has been collected", () => {
    expect(buildSaleFinancialPlan(null, {
      saleAmountCents: 3_000_00,
      amountPaidCents: 0,
      currency: "EUR",
      soldAt,
    }).createPaymentReceived).toBe(false);
  });
});
