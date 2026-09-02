import { describe, expect, it } from "vitest";

import { closerSaleUpdateInput } from "./closer-sales";

const validInput = {
  leadId: "lead-1",
  salesCallUrl: null,
  saleAmountCents: 3_000_00,
  amountPaidCents: 1_000_00,
  soldOn: "2026-09-01",
  financialOperationId: "c77c7ca1-86a9-40a1-860b-84746e429519",
  onboardingCompleted: false,
  onboardingVideoUrl: null,
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
});
