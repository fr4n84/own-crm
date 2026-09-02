import { describe, expect, it } from "vitest";

import { filterRelevantPlanningSpendPeriods } from "./service";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("commercial planning spend cutoff", () => {
  it("excludes future and irrelevant spend periods from the server-owned snapshot", () => {
    const rows = filterRelevantPlanningSpendPeriods([
      { id: "old", periodStart: day("2025-01-01"), periodEndExclusive: day("2025-02-01"), spendCents: 1, currency: "EUR" },
      { id: "relevant", periodStart: day("2025-12-01"), periodEndExclusive: day("2026-01-01"), spendCents: 1, currency: "EUR" },
      { id: "future", periodStart: day("2026-02-01"), periodEndExclusive: day("2026-03-01"), spendCents: 1, currency: "USD" },
    ], day("2026-01-01"));
    expect(rows.map((row) => row.id)).toEqual(["relevant"]);
    expect(rows.map((row) => row.currency)).not.toContain("USD");
  });
});
