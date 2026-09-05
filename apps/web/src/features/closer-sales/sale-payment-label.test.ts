import { describe, expect, it } from "vitest";

import { formatSalePaymentPlan } from "./sale-payment-label";

describe("sale payment label", () => {
  it("shows fullpay, financed details, and unclassified legacy sales", () => {
    expect(formatSalePaymentPlan({ paymentMethod: "fullpay", financingProvider: null, installmentMonths: null })).toBe("Fullpay");
    expect(formatSalePaymentPlan({ paymentMethod: "financed", financingProvider: "Sequra", installmentMonths: 12 })).toBe("Financiada · Sequra · 12 meses");
    expect(formatSalePaymentPlan({ paymentMethod: null, financingProvider: null, installmentMonths: null })).toBe("Sin clasificar");
  });
});
