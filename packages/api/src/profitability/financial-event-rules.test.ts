import { describe, expect, it } from "vitest";

import { classifyReversalInsertConflict, isSameRecordRequest, isSameReversalRequest, reversalProblem } from "./financial-event-rules";

const occurredAt = new Date("2026-08-24T10:00:00.000Z");
const stored = { leadId: "lead-1", kind: "payment_received" as const, amountCents: 10_000, currency: "EUR", occurredAt, note: null, externalReference: null, reversalOfId: null };

describe("financial event retry and reversal rules", () => {
  it("accepts only an exact idempotent record retry", () => {
    const request = { leadId: "lead-1", kind: "payment_received" as const, amountCents: 10_000, currency: "EUR", occurredAt };
    expect(isSameRecordRequest(stored, request)).toBe(true);
    expect(isSameRecordRequest(stored, { ...request, amountCents: 20_000 })).toBe(false);
  });

  it("accepts only an exact idempotent reversal retry", () => {
    const reversal = { ...stored, kind: "reversal" as const, reversalOfId: "source" };
    expect(isSameReversalRequest(reversal, { leadId: "lead-1", eventId: "source", occurredAt })).toBe(true);
    expect(isSameReversalRequest(reversal, { leadId: "lead-2", eventId: "source", occurredAt })).toBe(false);
  });

  it("rejects cross-lead and reversal-of-reversal corrections", () => {
    expect(reversalProblem(undefined, "lead-1")).toBe("not_found");
    expect(reversalProblem({ leadId: "lead-2", kind: "cost" }, "lead-1")).toBe("not_found");
    expect(reversalProblem({ leadId: "lead-1", kind: "reversal" }, "lead-1")).toBe("reversal_of_reversal");
  });

  it("classifies concurrent idempotency and reversal uniqueness conflicts deterministically", () => {
    const input = { leadId: "lead-1", eventId: "source-a", occurredAt, note: undefined };
    const sameRetry = { ...stored, kind: "reversal" as const, reversalOfId: "source-a" };
    const drifted = { ...sameRetry, reversalOfId: "source-b" };

    expect(classifyReversalInsertConflict({ idempotencyEvent: sameRetry, sourceReversalExists: true }, input)).toBe("retry");
    expect(classifyReversalInsertConflict({ idempotencyEvent: drifted, sourceReversalExists: false }, input)).toBe("idempotency_conflict");
    expect(classifyReversalInsertConflict({ idempotencyEvent: undefined, sourceReversalExists: true }, input)).toBe("already_reversed");
  });
});
