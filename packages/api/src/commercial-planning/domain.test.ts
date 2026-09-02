import { describe, expect, it } from "vitest";

import { addMadridCalendarDays, buildCommercialPlanning, lastClosedMadridSnapshot, type PlanningObservation, type PlanningScenario } from "./domain";

const day = (value: string) => new Date(`${value}T12:00:00.000Z`);

function observation(index: number, overrides: Partial<PlanningObservation> = {}): PlanningObservation {
  const assignedAt = day(`2025-${index < 10 ? "08" : "07"}-${String((index % 28) + 1).padStart(2, "0")}`);
  return {
    leadId: `lead-${index}`,
    assignedAt,
    appointmentAt: index % 2 === 0 ? new Date(assignedAt.getTime() + 86_400_000) : null,
    soldAt: index % 4 === 0 ? new Date(assignedAt.getTime() + 2 * 86_400_000) : null,
    financialEvents: index % 4 === 0 ? [
      { id: `payment-${index}`, kind: "payment_received", amountCents: 100_000, currency: "EUR", reversalOfId: null, occurredAt: new Date(assignedAt.getTime() + 3 * 86_400_000) },
      { id: `cost-${index}`, kind: "cost", amountCents: 10_000, currency: "EUR", reversalOfId: null, occurredAt: new Date(assignedAt.getTime() + 3 * 86_400_000) },
    ] : [],
    ...overrides,
  };
}

const completeScenario: PlanningScenario = {
  leadVolumePerDay: 10,
  appointmentRateBps: 5_000,
  saleRateBps: 2_000,
  collectionPerSaleCents: 100_000,
  refundPerSaleCents: 5_000,
  directCostPerSaleCents: 10_000,
  adSpendPerDayCents: 20_000,
  seasonalityEnabled: false,
  seasonalityFactorBps: 10_000,
  capacity: { availableCallers: 1, callerCapacityPerDay: 5, availableClosers: 2, closerCapacityPerDay: 3, targetUtilizationBps: 8_500 },
  commission: { fixedPerSaleCents: 5_000, collectionsPercentBps: 500, callerShareBps: 4_000, goalSales: 50, goalBonusCents: 20_000, stretchSales: 100, stretchBonusCents: 50_000 },
};

describe("commercial planning domain", () => {
  it("owns the last closed Europe/Madrid snapshot across DST", () => {
    expect(lastClosedMadridSnapshot(new Date("2026-03-29T10:00:00.000Z"))).toEqual({ day: "2026-03-28", from: new Date("2026-03-27T23:00:00.000Z"), to: new Date("2026-03-28T23:00:00.000Z") });
    expect(lastClosedMadridSnapshot(new Date("2026-10-25T10:00:00.000Z")).to).toEqual(new Date("2026-10-24T22:00:00.000Z"));
    expect(addMadridCalendarDays(new Date("2026-03-28T12:00:00.000Z"), 1)).toEqual(new Date("2026-03-29T11:00:00.000Z"));
    expect(addMadridCalendarDays(new Date("2026-10-24T11:00:00.000Z"), 1)).toEqual(new Date("2026-10-25T12:00:00.000Z"));
  });

  it("keeps observed baseline and introduced scenario assumptions separate", () => {
    const result = buildCommercialPlanning({ observations: Array.from({ length: 40 }, (_, index) => observation(index)), currency: "EUR", scenario: completeScenario, asOf: day("2026-01-01") });
    expect(result.baseline.assumptions.leadVolumePerDay.origin).toBe("observed");
    expect(result.scenario.assumptions.leadVolumePerDay).toEqual({ value: 10, origin: "introduced" });
    expect(result.scenario.assumptions.seasonalityEnabled).toEqual({ value: false, origin: "introduced" });
    expect(result.notice).toMatch(/simulaci/i);
  });

  it("returns only 30/60/90 horizons with arithmetic closure and deltas", () => {
    const result = buildCommercialPlanning({ observations: Array.from({ length: 40 }, (_, index) => observation(index)), currency: "EUR", scenario: completeScenario, asOf: day("2026-01-01") });
    expect(result.scenario.forecast.map((row) => row.days)).toEqual([30, 60, 90]);
    for (const row of result.scenario.forecast) {
      expect(row.marginBeforeUnmodeledCostsCents).toBe(row.collectionsCents - row.refundsCents - row.directCostsCents - row.commissionsCents - row.adSpendCents);
      expect(row.delta).toBeDefined();
    }
    expect(result.scenario.sensitivity.map((item) => item.key)).toEqual(["downside", "base", "upside"]);
  });

  it("models caller load from leads and closer load from appointments with explicit hiring rounding", () => {
    const result = buildCommercialPlanning({ observations: [], currency: "EUR", scenario: completeScenario, asOf: day("2026-01-01") });
    const capacity = result.scenario.capacity.find((row) => row.days === 30);
    if (!capacity || !capacity.callers || !capacity.closers) throw new Error("Missing 30-day capacity");
    expect(capacity.callers.demand).toBe(300);
    expect(capacity.closers.demand).toBe(150);
    expect(capacity.callers.hiresSuggested).toBeGreaterThan(0);
    expect(capacity.callers.rule).toMatch(/ceil|redonde/i);
  });

  it("calculates fixed, collection percentage and goal/stretch bonuses by role", () => {
    const result = buildCommercialPlanning({ observations: [], currency: "EUR", scenario: completeScenario, asOf: day("2026-01-01") });
    const row = result.scenario.forecast.find((item) => item.days === 30);
    if (!row) throw new Error("Missing 30-day forecast");
    if (row.commission.callersCents === null || row.commission.closersCents === null) throw new Error("Missing role split");
    expect(row.sales).toBe(60);
    expect(row.commission.bonusTier).toBe("goal");
    expect(row.commission.callersCents + row.commission.closersCents).toBe(row.commissionsCents);
    expect(row.commission.rule).toMatch(/reparto.*supuesto/i);
  });

  it("requires explicit currency and reports insufficient observations rather than inventing a baseline", () => {
    const noCurrency = buildCommercialPlanning({ observations: [observation(4)], scenario: {}, asOf: day("2026-01-01") });
    expect(noCurrency.economicStatus).toBe("currency_required");
    const sparse = buildCommercialPlanning({ observations: [observation(1)], currency: "EUR", scenario: {}, asOf: day("2026-01-01") });
    expect(sparse.baseline.status).toBe("insufficient_evidence");
    expect(sparse.baseline.assumptions.saleRateBps.value).toBeNull();
    expect(sparse.baseline.forecast).toEqual([]);
  });

  it("uses 30-day conversion and 90-day economy maturity and honors reversals", () => {
    const recent = observation(100, { assignedAt: day("2025-12-20"), appointmentAt: day("2025-12-21"), soldAt: day("2025-12-22") });
    const reversed = observation(101, { assignedAt: day("2025-10-01"), soldAt: day("2025-10-02"), financialEvents: [
      { id: "p", kind: "payment_received", amountCents: 100_000, currency: "EUR", reversalOfId: null, occurredAt: day("2025-10-03") },
      { id: "r", kind: "reversal", amountCents: 100_000, currency: "EUR", reversalOfId: "p", occurredAt: day("2025-11-01") },
    ] });
    const result = buildCommercialPlanning({ observations: [recent, reversed], currency: "EUR", scenario: {}, asOf: day("2026-01-01") });
    expect(result.baseline.coverage.conversionMature).toBe(1);
    expect(result.baseline.coverage.economicMature).toBe(1);
    expect(result.baseline.assumptions.collectionPerSaleCents.value).toBe(0);
  });

  it("freezes outcomes at each observation maturity horizon", () => {
    const assignedAt = day("2025-10-05");
    const late = observation(200, {
      assignedAt,
      appointmentAt: day("2025-11-10"),
      soldAt: day("2025-11-11"),
      financialEvents: [
        { id: "paid", kind: "payment_received", amountCents: 100_000, currency: "EUR", reversalOfId: null, occurredAt: day("2025-10-15") },
        { id: "late-reversal", kind: "reversal", amountCents: 100_000, currency: "EUR", reversalOfId: "paid", occurredAt: day("2026-01-10") },
      ],
    });
    const result = buildCommercialPlanning({ observations: [late], currency: "EUR", scenario: {}, asOf: day("2026-02-01") });
    expect(result.baseline.assumptions.appointmentRateBps.value).toBe(0);
    expect(result.baseline.assumptions.saleRateBps.value).toBe(0);
    expect(result.baseline.assumptions.collectionPerSaleCents.value).toBe(100_000);
  });

  it("never leaks observation identifiers in its public result", () => {
    const result = buildCommercialPlanning({ observations: [observation(4, { leadId: "private-lead-reference" })], currency: "EUR", scenario: completeScenario, asOf: day("2026-01-01") });
    expect(JSON.stringify(result)).not.toContain("private-lead-reference");
  });

  it("does not treat missing advertising-spend days as observed zero", () => {
    const result = buildCommercialPlanning({
      observations: Array.from({ length: 40 }, (_, index) => observation(index)),
      spendPeriods: [{ id: "partial", periodStart: day("2025-12-01"), periodEndExclusive: day("2025-12-01"), spendCents: 1_000, currency: "EUR" }],
      currency: "EUR",
      scenario: {},
      asOf: day("2026-01-01"),
    });
    expect(result.baseline.assumptions.adSpendPerDayCents.value).toBeNull();
  });

  it("treats spend periodEnd as exclusive and distributes a full natural-day range once", () => {
    const result = buildCommercialPlanning({
      observations: Array.from({ length: 40 }, (_, index) => observation(index)),
      spendPeriods: [{ id: "full", periodStart: day("2025-10-03"), periodEndExclusive: day("2026-01-01"), spendCents: 9_000, currency: "EUR" }],
      currency: "EUR", scenario: {}, asOf: day("2026-01-01"),
    });
    expect(result.baseline.assumptions.adSpendPerDayCents.value).toBe(100);
  });

  it("scopes economic sales and denominators strictly to the selected currency", () => {
    const eur = observation(300, { assignedAt: day("2025-10-01"), soldAt: day("2025-10-02"), financialEvents: [{ id: "eur", kind: "payment_received", amountCents: 100_000, currency: "EUR", reversalOfId: null, occurredAt: day("2025-10-03") }] });
    const usd = observation(301, { assignedAt: day("2025-10-01"), soldAt: day("2025-10-02"), financialEvents: [{ id: "usd", kind: "payment_received", amountCents: 900_000, currency: "USD", reversalOfId: null, occurredAt: day("2025-10-03") }] });
    const result = buildCommercialPlanning({ observations: [eur, usd], currency: "EUR", scenario: {}, asOf: day("2026-01-01") });
    expect(result.baseline.coverage.economicMature).toBe(1);
    expect(result.baseline.coverage.economicSales).toBe(1);
    expect(result.baseline.assumptions.collectionPerSaleCents.value).toBe(100_000);
  });

  it("labels policy defaults honestly", () => {
    const result = buildCommercialPlanning({ observations: [], currency: "EUR", scenario: {}, asOf: day("2026-01-01") });
    expect(result.baseline.assumptions.seasonalityEnabled.origin).toBe("policy_default");
    expect(result.baseline.assumptions.seasonalityFactorBps.origin).toBe("policy_default");
    expect(result.scenario.assumptions.seasonalityEnabled.origin).toBe("policy_default");
  });

  it("uses target-adjusted effective capacity consistently", () => {
    const scenario = { ...completeScenario, capacity: { availableCallers: 2, callerCapacityPerDay: 5, availableClosers: 2, closerCapacityPerDay: 3, targetUtilizationBps: 8_500 } };
    const result = buildCommercialPlanning({ observations: [], currency: "EUR", scenario, asOf: day("2026-01-01") });
    const row = result.scenario.capacity.find((item) => item.days === 30);
    if (!row || row.status !== "available" || !row.callers) throw new Error("Missing capacity");
    expect(row.callers.effectiveCapacity).toBe(255);
    expect(row.callers.deficitUnits).toBe(45);
    expect(row.callers.excessUnits).toBe(0);
    expect(row.callers.hiresSuggested).toBe(1);
  });

  it("applies partial commission fields with per-field fallback origins", () => {
    const result = buildCommercialPlanning({ observations: [], currency: "EUR", scenario: { ...completeScenario, commission: { collectionsPercentBps: 500 } }, asOf: day("2026-01-01") });
    const row = result.scenario.forecast.find((item) => item.days === 30);
    if (!row) throw new Error("Missing forecast");
    expect(row.commissionsCents).toBe(300_000);
    expect(row.commission.assumptions.collectionsPercentBps.origin).toBe("introduced");
    expect(row.commission.assumptions.fixedPerSaleCents.origin).toBe("policy_default");
    expect(row.commission.callersCents).toBeNull();
    expect(row.commission.status).toBe("partial");
  });
});
