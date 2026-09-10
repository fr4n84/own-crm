import { describe, expect, it } from "vitest";

import { buildInstallmentSchedule, deriveReceivableState } from "./domain";

describe("receivable schedule", () => {
  it("distributes cents exactly and creates deterministic monthly due dates", () => {
    expect(buildInstallmentSchedule({ totalCents: 10_000, installments: 3, firstDueOn: "2026-01-31" }))
      .toEqual([
        { sequence: 1, dueOn: "2026-01-31", expectedCents: 3_334 },
        { sequence: 2, dueOn: "2026-02-28", expectedCents: 3_333 },
        { sequence: 3, dueOn: "2026-03-31", expectedCents: 3_333 },
      ]);
  });

  it("derives partial, paid, next due and overdue from immutable allocations", () => {
    const state = deriveReceivableState({
      asOf: "2026-02-15",
      installments: [
        { id: "i1", sequence: 1, dueOn: "2026-01-31", expectedCents: 5_000 },
        { id: "i2", sequence: 2, dueOn: "2026-02-28", expectedCents: 5_000 },
      ],
      allocations: [
        { installmentId: "i1", paymentEventId: "p1", amountCents: 3_000 },
        { installmentId: "i1", paymentEventId: "p2", amountCents: 2_000 },
      ],
      reversedPaymentEventIds: new Set(["p2"]),
    });
    expect(state).toMatchObject({ contractedCents: 10_000, collectedCents: 3_000, outstandingCents: 7_000, overdueCents: 2_000, nextDueOn: "2026-01-31" });
    expect(state.installments.map((item) => item.status)).toEqual(["partial", "pending"]);
  });
});
