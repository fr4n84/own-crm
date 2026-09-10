import { describe, expect, it } from "vitest";

import { buildObservatoryMetricExplanations, OBSERVATORY_METRIC_EXPLANATION_VERSION } from "./metric-explanations";

describe("observatory metric explanations", () => {
  it("owns a complete versioned explanation contract without record identifiers", () => {
    const explanations = buildObservatoryMetricExplanations({
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-02-01T00:00:00Z"),
      asOf: new Date("2026-02-01T00:00:00Z"),
      observations: 40,
      duplicateObservationsExcluded: 2,
      withoutAttribution: 3,
      salesWithoutLedger: 1,
      currency: "EUR",
      seasonalityAvailable: true,
      anomaliesAvailable: true,
      commercialBridgeAvailable: true,
      economicBridgeAvailable: true,
      riskAvailable: true,
    });

    expect(OBSERVATORY_METRIC_EXPLANATION_VERSION).toMatch(/^observatory-metric-explanations-v/);
    expect(Object.keys(explanations)).toEqual(expect.arrayContaining([
      "seasonality.weekly_volume",
      "seasonality.weekday_conversion",
      "anomalies.volume",
      "anomalies.conversion",
      "bridge.commercial_delta",
      "bridge.economic_margin",
      "risk.top1",
      "risk.hhi",
      "quality.unique_observations",
      "quality.without_attribution",
    ]));
    for (const explanation of Object.values(explanations)) {
      expect(explanation).toMatchObject({
        version: OBSERVATORY_METRIC_EXPLANATION_VERSION,
        meaning: expect.any(String),
        formula: expect.any(String),
        unit: expect.any(String),
        sources: expect.any(Array),
        period: { timeZone: "Europe/Madrid", boundary: "[desde, hasta)" },
        syntheticExample: { scenario: expect.any(String), result: expect.any(String) },
        limitations: expect.any(Array),
        evidence: {
          dataQuality: { state: expect.any(String), explanation: expect.any(String) },
          statisticalConfidence: { state: expect.any(String), explanation: expect.any(String) },
        },
        humanRecommendation: expect.any(String),
      });
      expect(explanation.sources.length).toBeGreaterThan(0);
      expect(explanation.limitations.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(explanations)).not.toMatch(/lead-[0-9a-f]|caller-[0-9a-f]|closer-[0-9a-f]/i);
  });

  it("separates incomplete data from weak statistical evidence", () => {
    const explanations = buildObservatoryMetricExplanations({
      from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-08T00:00:00Z"), asOf: new Date("2026-01-08T00:00:00Z"),
      observations: 2, duplicateObservationsExcluded: 0, withoutAttribution: 2, salesWithoutLedger: null, currency: null,
      seasonalityAvailable: false, anomaliesAvailable: false, commercialBridgeAvailable: false, economicBridgeAvailable: false, riskAvailable: true,
    });
    expect(explanations["quality.without_attribution"].evidence.dataQuality.state).toBe("limited");
    expect(explanations["seasonality.weekly_volume"].evidence.statisticalConfidence.state).toBe("insufficient");
    expect(explanations["bridge.economic_margin"].evidence.dataQuality.state).toBe("unavailable");
  });
});
