import { describe, expect, it } from "vitest";
import type { Context } from "../context";

import { closerSaleUpdateInput, closerSalesRouter } from "./closer-sales";

const validInput = {
  leadId: "lead-1",
  salesCallUrl: null,
  saleAmountCents: 3_000_00,
  amountPaidCents: 1_000_00,
  soldOn: "2026-09-01",
  financialOperationId: "c77c7ca1-86a9-40a1-860b-84746e429519",
  onboardingCompleted: false,
  onboardingVideoUrl: null,
  paymentMethod: "financed" as const,
  financingProvider: "Sequra",
  installmentMonths: 12,
};

describe("closer sales input", () => {
  it("accepts a partial collection without exposing currency selection", () => {
    expect(closerSaleUpdateInput.parse(validInput)).toMatchObject({
      saleAmountCents: 3_000_00,
      amountPaidCents: 1_000_00,
    });
  });

  it("rejects a collected amount greater than the sale", () => {
    expect(() => closerSaleUpdateInput.parse({
      ...validInput,
      amountPaidCents: 3_000_01,
    })).toThrow();
  });

  it("rejects impossible sale dates and non-idempotent operation identifiers", () => {
    expect(() => closerSaleUpdateInput.parse({ ...validInput, soldOn: "2026-02-30" })).toThrow();
    expect(() => closerSaleUpdateInput.parse({ ...validInput, financialOperationId: "retry-me" })).toThrow();
  });

  it("keeps legacy sales unclassified and validates financed sale details", () => {
    const { paymentMethod: _paymentMethod, financingProvider: _financingProvider, installmentMonths: _installmentMonths, ...legacyInput } = validInput;
    expect(closerSaleUpdateInput.parse(legacyInput)).toMatchObject({
      paymentMethod: null,
      financingProvider: null,
      installmentMonths: null,
    });
    expect(closerSaleUpdateInput.parse({
      ...validInput,
      paymentMethod: null,
      financingProvider: null,
      installmentMonths: null,
    })).toMatchObject({ paymentMethod: null });

    expect(() => closerSaleUpdateInput.parse({
      ...validInput,
      financingProvider: null,
    })).toThrow();
    expect(() => closerSaleUpdateInput.parse({
      ...validInput,
      paymentMethod: "fullpay",
      financingProvider: "Sequra",
      installmentMonths: 12,
    })).toThrow();
  });

  it("keeps reconciliation profile, preview, confirmation and cash reporting Admin-only", async () => {
    expect(closerSalesRouter._def.procedures).toMatchObject({
      reconciliationProfiles: expect.anything(),
      createReconciliationProfile: expect.anything(),
      previewReconciliation: expect.anything(),
      confirmReconciliation: expect.anything(),
      cashRealizedReport: expect.anything(),
    });
    const caller = closerSalesRouter.createCaller({
      session: { user: { id: "caller", roleId: "caller", name: "Caller", email: "caller@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } },
      role: { id: "caller", name: "Caller", permissions: ["sales:read"] },
      permissions: ["sales:read"],
    } as Context);
    await expect(caller.reconciliationProfiles()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.previewReconciliation({ profileId: "provider", csv: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.cashRealizedReport()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
