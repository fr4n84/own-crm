import { describe, expect, it } from "vitest";
import { buildCommercialPlanning } from "./domain";
import { buildPlanningObservations, normalizePlanningSpendPeriods } from "./facts";

describe("commercial planning facts", () => {
  const storedStartOfDay = (day: string) => new Date(`${day}T00:00:00.000Z`);
  const storedEndOfDay = (day: string) => new Date(`${day}T23:59:59.999Z`);

  it("normalizes the inclusive stored end of a one-day spend period to a Madrid-exclusive boundary", () => {
    const [period] = normalizePlanningSpendPeriods([{
      id: "one-day",
      periodStart: storedStartOfDay("2026-01-15"),
      periodEnd: storedEndOfDay("2026-01-15"),
      spendCents: 1_000,
      currency: "EUR",
    }]);

    expect(period?.periodStart).toEqual(new Date("2026-01-14T23:00:00.000Z"));
    expect(period?.periodEndExclusive).toEqual(new Date("2026-01-15T23:00:00.000Z"));
  });

  it("normalizes multi-day spend across Madrid DST without converting calendar days into 24-hour blocks", () => {
    const [period] = normalizePlanningSpendPeriods([{
      id: "spring-dst",
      periodStart: storedStartOfDay("2026-03-28"),
      periodEnd: storedEndOfDay("2026-03-30"),
      spendCents: 3_000,
      currency: "EUR",
    }]);

    expect(period?.periodStart).toEqual(new Date("2026-03-27T23:00:00.000Z"));
    expect(period?.periodEndExclusive).toEqual(new Date("2026-03-30T22:00:00.000Z"));
  });

  it("keeps an open Madrid day in the spend divisor without assigning it to the closed snapshot", () => {
    const spendPeriods = normalizePlanningSpendPeriods([{
      id: "touches-open-day",
      periodStart: storedStartOfDay("2025-12-30"),
      periodEnd: storedEndOfDay("2026-03-30"),
      spendCents: 9_100,
      currency: "EUR",
    }]);
    const result = buildCommercialPlanning({
      observations: [],
      spendPeriods,
      currency: "EUR",
      scenario: {},
      asOf: new Date("2026-03-29T22:00:00.000Z"),
    });

    expect(result.baseline.assumptions.adSpendPerDayCents.value).toBe(100);
  });

  it("deduplicates leads and milestones deterministically before the exclusive cutoff", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const rows = buildPlanningObservations({ leads: [{ id: "private-lead", createdAt: new Date("2025-01-01T00:00:00.000Z") }], activities: [
      { id: "b", leadId: "private-lead", kind: "appointment_scheduled", occurredAt: new Date("2025-02-02T00:00:00.000Z"), description: null, metadata: {} },
      { id: "a", leadId: "private-lead", kind: "appointment_scheduled", occurredAt: new Date("2025-02-01T00:00:00.000Z"), description: null, metadata: {} },
      { id: "sale", leadId: "private-lead", kind: "closer_feedback", occurredAt: new Date("2025-03-01T00:00:00.000Z"), description: "Venta", metadata: {} },
      { id: "future", leadId: "private-lead", kind: "closer_feedback", occurredAt: cutoff, description: "Venta", metadata: {} },
    ], financial: [], cutoff });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appointmentAt).toEqual(new Date("2025-02-01T00:00:00.000Z"));
    expect(rows[0]?.soldAt).toEqual(new Date("2025-03-01T00:00:00.000Z"));
  });

  it("does not expose names, caller ids or closer ids in planning observations", () => {
    const rows = buildPlanningObservations({ leads: [{ id: "lead", createdAt: new Date("2025-01-01T00:00:00.000Z") }], activities: [], financial: [], cutoff: new Date("2026-01-01T00:00:00.000Z") });
    expect(rows[0]).not.toHaveProperty("name");
    expect(rows[0]).not.toHaveProperty("callerId");
    expect(rows[0]).not.toHaveProperty("closerId");
  });
});
