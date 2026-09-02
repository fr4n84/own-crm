import { describe, expect, it } from "vitest";

import {
  buildCommercialObservatory,
  madridDayKey,
  normalizeMadridRange,
  type ObservatoryObservation,
} from "./domain";

const at = (value: string) => new Date(value);

function observation(
  id: string,
  assignedAt: string,
  overrides: Partial<ObservatoryObservation> = {},
): ObservatoryObservation {
  return {
    leadId: id,
    assignedAt: at(assignedAt),
    soldAt: null,
    source: "Meta",
    campaign: "Campaña A",
    callerId: "caller-a",
    closerId: "closer-a",
    profile: "employed",
    financialEvents: [],
    ...overrides,
  };
}

describe("commercial observatory", () => {
  it("normalizes inclusive calendar dates on the server and always excludes Madrid's open day", () => {
    const range = normalizeMadridRange({ fromDay: "2026-03-28", toDay: "2026-03-29", now: at("2026-03-29T12:00:00Z") });
    expect(range.from.toISOString()).toBe("2026-03-27T23:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(range.lastClosedDay).toBe("2026-03-28");
  });

  it("uses Europe/Madrid calendar boundaries across DST", () => {
    expect(madridDayKey(at("2026-03-29T00:30:00.000Z"))).toBe("2026-03-29");
    expect(madridDayKey(at("2026-03-29T22:30:00.000Z"))).toBe("2026-03-30");
    expect(madridDayKey(at("2026-10-25T22:30:00.000Z"))).toBe("2026-10-25");
  });

  it("deduplicates leads, ignores future rows, and keeps the baseline strictly prior", () => {
    const rows = [
      observation("baseline", "2026-01-10T10:00:00Z"),
      observation("current", "2026-02-10T10:00:00Z"),
      observation("current", "2026-02-11T10:00:00Z", { campaign: "duplicate" }),
      observation("future", "2026-03-02T10:00:00Z"),
    ];
    const result = buildCommercialObservatory({
      observations: rows,
      from: at("2026-02-01T00:00:00Z"),
      to: at("2026-03-01T00:00:00Z"),
      asOf: at("2026-03-01T00:00:00Z"),
    });
    expect(result.bridge.commercial.current.volume).toBe(1);
    expect(result.bridge.commercial.baseline.volume).toBe(1);
    expect(result.coverage.duplicateObservationsExcluded).toBe(1);
    expect(JSON.stringify(result)).not.toContain("future");
  });

  it("requires 30-day maturity and decomposes the sales delta exactly", () => {
    const rows = [
      observation("b1", "2025-12-05T10:00:00Z", { soldAt: at("2025-12-15T10:00:00Z") }),
      observation("b2", "2025-12-06T10:00:00Z"),
      observation("c1", "2026-01-01T00:00:00Z", { soldAt: at("2026-01-10T10:00:00Z") }),
      observation("c2", "2026-01-02T00:00:00Z", { soldAt: at("2026-01-11T10:00:00Z") }),
      observation("immature", "2026-01-25T10:00:00Z", { soldAt: at("2026-01-26T10:00:00Z") }),
    ];
    const result = buildCommercialObservatory({ observations: rows, from: at("2026-01-01T00:00:00Z"), to: at("2026-02-02T00:00:00Z"), asOf: at("2026-02-02T00:00:00Z") });
    const commercial = result.bridge.commercial;
    expect(commercial.current.sample).toBe(2);
    expect(commercial.deltaSales).toBe(commercial.volumeContribution + commercial.conversionContribution);
  });

  it("uses cumulative as-of financial projections so reversals and the margin waterfall are exact", () => {
    const current = observation("current", "2026-01-05T10:00:00Z", {
      soldAt: at("2026-01-06T10:00:00Z"),
      financialEvents: [
        { id: "payment", kind: "payment_received", amountCents: 10_000, currency: "EUR", reversalOfId: null, occurredAt: at("2026-01-06T10:00:00Z") },
        { id: "reverse", kind: "reversal", amountCents: 10_000, currency: "EUR", reversalOfId: "payment", occurredAt: at("2026-01-20T10:00:00Z") },
        { id: "cost", kind: "cost", amountCents: 2_000, currency: "EUR", reversalOfId: null, occurredAt: at("2026-01-07T10:00:00Z") },
      ],
    });
    const result = buildCommercialObservatory({ observations: [current], from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z"), currency: "EUR" });
    const economic = result.bridge.economic;
    expect(economic.status).toBe("available");
    if (economic.status !== "available") throw new Error("expected economic bridge");
    expect(economic.current.marginCents).toBe(-2_000);
    expect(economic.deltaMarginCents).toBe(economic.contributions.reduce((sum, row) => sum + row.amountCents, 0));
  });

  it("does not mix currencies and reports currency_required when selection is ambiguous", () => {
    const rows = [
      observation("eur", "2026-01-01T10:00:00Z", { financialEvents: [{ id: "eur-payment", kind: "payment_received", amountCents: 100, currency: "EUR", reversalOfId: null, occurredAt: at("2026-01-02T10:00:00Z") }] }),
      observation("usd", "2026-01-02T10:00:00Z", { financialEvents: [{ id: "usd-payment", kind: "payment_received", amountCents: 100, currency: "USD", reversalOfId: null, occurredAt: at("2026-01-03T10:00:00Z") }] }),
    ];
    const result = buildCommercialObservatory({ observations: rows, from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z") });
    expect(result.bridge.economic.status).toBe("currency_required");
    expect(result.resolvedCurrency).toBeNull();
    expect(result.bridge.economic.rule).toContain("varias monedas");
    expect(result.bridge.economic.rule).not.toContain("Selecciona");
  });

  it("resolves the only observed currency server-side without implicit FX", () => {
    const rows = [
      observation("eur", "2026-01-01T10:00:00Z", { financialEvents: [{ id: "eur-payment", kind: "payment_received", amountCents: 100, currency: "EUR", reversalOfId: null, occurredAt: at("2026-01-02T10:00:00Z") }] }),
    ];

    const result = buildCommercialObservatory({ observations: rows, from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z") });

    expect(result.resolvedCurrency).toBe("EUR");
    expect(result.bridge.economic.status).toBe("available");
    expect(result.risk.currency).toBe("EUR");
  });

  it("calculates concentration from absolute exposure and classifies HHI thresholds", () => {
    const rows = Array.from({ length: 10 }, (_, index) => observation(`lead-${index}`, "2026-01-05T10:00:00Z", {
      source: index < 6 ? "Meta" : `Source ${index}`,
      financialEvents: [{ id: `cost-${index}`, kind: "cost", amountCents: index === 0 ? 5_000 : 100, currency: "EUR", reversalOfId: null, occurredAt: at("2026-01-06T10:00:00Z") }],
    }));
    const result = buildCommercialObservatory({ observations: rows, from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z"), currency: "EUR" });
    const sourceRisk = result.risk.dimensions.find((row) => row.dimension === "source");
    expect(sourceRisk?.top1Bps).toBe(6000);
    expect(sourceRisk?.hhi).toBeCloseTo(0.4, 6);
    expect(sourceRisk?.level).toBe("high");
    expect(sourceRisk?.negativeMarginExposureCents).toBe(5_900);
  });

  it("returns deterministic anomaly states with visible samples and prior baselines", () => {
    const rows = Array.from({ length: 80 }, (_, index) => observation(`lead-${index}`, `2026-01-${String(1 + (index % 20)).padStart(2, "0")}T10:00:00Z`, {
      source: index < 70 ? "Meta" : "Organic",
      soldAt: index % 4 === 0 ? at("2026-01-25T10:00:00Z") : null,
    }));
    const result = buildCommercialObservatory({ observations: rows, from: at("2026-01-15T00:00:00Z"), to: at("2026-03-01T00:00:00Z"), asOf: at("2026-03-01T00:00:00Z") });
    for (const row of result.anomalies.items) {
      expect(["anomaly", "within_expected_range", "insufficient_evidence"]).toContain(row.state);
      expect(row.baselineTo.getTime()).toBeLessThanOrEqual(row.currentFrom.getTime());
      expect(row.sample).toBeGreaterThanOrEqual(0);
    }
  });

  it("never serializes lead identifiers or names in the server-owned snapshot", () => {
    const result = buildCommercialObservatory({ observations: [observation("private-lead-id", "2026-01-05T10:00:00Z", { callerId: "private-caller-id", closerId: "private-closer-id" })], from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z") });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("private-lead-id");
    expect(serialized).not.toContain("private-caller-id");
    expect(serialized).not.toContain("private-closer-id");
    expect(serialized).toContain("Sin identificar");
    expect(result.policyVersion).toMatch(/^commercial-observatory-v/);
  });

  it("does not make seasonality available from empty calendar days or partial weeks", () => {
    const empty = buildCommercialObservatory({ observations: [], from: at("2026-01-01T00:00:00Z"), to: at("2026-04-01T00:00:00Z"), asOf: at("2026-04-01T00:00:00Z") });
    expect(empty.seasonality.status).toBe("insufficient_evidence");
    expect(empty.seasonality.sampleDays).toBe(0);
    const partial = buildCommercialObservatory({ observations: [observation("only", "2026-01-01T10:00:00Z")], from: at("2026-01-01T00:00:00Z"), to: at("2026-01-06T00:00:00Z"), asOf: at("2026-01-06T00:00:00Z") });
    expect(partial.seasonality.byWeek).toHaveLength(0);
  });

  it("requires enough closed historical buckets before declaring an anomaly within range", () => {
    const rows = Array.from({ length: 100 }, (_, index) => observation(`dense-${index}`, index < 50 ? "2026-01-01T10:00:00Z" : "2026-01-03T10:00:00Z"));
    const result = buildCommercialObservatory({ observations: rows, from: at("2026-01-03T00:00:00Z"), to: at("2026-01-05T00:00:00Z"), asOf: at("2026-01-05T00:00:00Z") });
    const globalVolume = result.anomalies.items.find((row) => row.key === "global:volume");
    expect(globalVolume?.state).toBe("insufficient_evidence");
    expect(globalVolume?.baselineBucketCount).toBe(2);
    const globalConversion = result.anomalies.items.find((row) => row.key === "global:conversion");
    expect(globalConversion?.rule).toContain("5 pp");
  });

  it("requires at least 10 current and 30 historical mature cases before conversion can be within range", () => {
    const baseline = Array.from({ length: 30 }, (_, index) => observation(`baseline-mature-${index}`, `2026-01-${String(1 + index).padStart(2, "0")}T10:00:00Z`, { soldAt: index < 3 ? at("2026-02-01T10:00:00Z") : null }));
    const current = [observation("current-tiny", "2026-04-01T10:00:00Z")];
    const result = buildCommercialObservatory({ observations: [...baseline, ...current], from: at("2026-04-01T00:00:00Z"), to: at("2026-07-01T00:00:00Z"), asOf: at("2026-07-01T00:00:00Z") });
    const conversion = result.anomalies.items.find((row) => row.key === "global:conversion");
    expect(conversion?.state).toBe("insufficient_evidence");
    expect(conversion?.sample).toBe(1);
    expect(conversion?.baselineSample).toBe(30);
    expect(conversion?.rule).toContain("10 actuales");
    expect(conversion?.rule).toContain("30 históricos");
  });

  it("scopes currencies and selected-currency ledger coverage to the two compared periods", () => {
    const rows = [
      observation("old-usd", "2025-01-01T10:00:00Z", { financialEvents: [{ id: "old-usd-payment", kind: "payment_received", amountCents: 100, currency: "USD", reversalOfId: null, occurredAt: at("2025-01-02T10:00:00Z") }] }),
      observation("sale-other-currency", "2026-01-05T10:00:00Z", { soldAt: at("2026-01-06T10:00:00Z"), financialEvents: [{ id: "current-usd-payment", kind: "payment_received", amountCents: 100, currency: "USD", reversalOfId: null, occurredAt: at("2026-01-06T10:00:00Z") }] }),
    ];
    const result = buildCommercialObservatory({ observations: rows, from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z"), currency: "EUR" });
    expect(result.currencies).toEqual(["USD"]);
    expect(result.coverage.observations).toBe(1);
    expect(result.bridge.economic.status).toBe("not_comparable");
    expect(result.risk.coverage.salesWithoutLedger).toBe(1);
  });

  it("does not call an empty selected-currency projection available", () => {
    const result = buildCommercialObservatory({ observations: [observation("lead", "2026-01-05T10:00:00Z")], from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z"), currency: "EUR" });
    expect(result.bridge.economic.status).not.toBe("available");
  });

  it("excludes events exactly on the open-day boundary from every section", () => {
    const to = at("2026-02-10T00:00:00Z");
    const row = observation("boundary", "2026-01-01T00:00:00Z", {
      soldAt: to,
      financialEvents: [{ id: "boundary-payment", kind: "payment_received", amountCents: 10_000, currency: "EUR", reversalOfId: null, occurredAt: to }],
    });
    const result = buildCommercialObservatory({ observations: [row], from: at("2026-01-01T00:00:00Z"), to, asOf: to, currency: "EUR" });
    expect(result.bridge.commercial.current.sales).toBe(0);
    expect(result.currencies).toEqual([]);
    expect(result.bridge.economic.status).not.toBe("available");
    expect(result.risk.coverage.salesWithoutLedger).toBe(0);
  });

  it("leaves selected-currency ledger coverage unevaluable when no currency was selected", () => {
    const result = buildCommercialObservatory({ observations: [observation("sold", "2026-01-01T00:00:00Z", { soldAt: at("2026-01-02T00:00:00Z") })], from: at("2026-01-01T00:00:00Z"), to: at("2026-02-10T00:00:00Z"), asOf: at("2026-02-10T00:00:00Z") });
    expect(result.risk.coverage.salesWithoutLedger).toBeNull();
    expect(result.risk.coverage.ledgerStatus).toBe("currency_required");
  });
});
