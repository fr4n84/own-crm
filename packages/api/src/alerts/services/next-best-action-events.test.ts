import { describe, expect, it } from "vitest";

import { buildRecommendationMetrics, buildServerEvidenceSnapshot } from "./next-best-action-events";

describe("next best action metrics", () => {
  it("measures completion, skipping, compliance, and reaction time", () => {
    expect(
      buildRecommendationMetrics([
        {
          kind: "recommendation_shown",
          metadata: { recommendationKey: "first" },
          occurredAt: new Date("2026-08-22T10:00:00.000Z"),
        },
        {
          kind: "recommendation_completed",
          metadata: { recommendationKey: "first", reactionTimeMs: 600_000 },
          occurredAt: new Date("2026-08-22T10:10:00.000Z"),
        },
        {
          kind: "recommendation_shown",
          metadata: { recommendationKey: "second" },
          occurredAt: new Date("2026-08-22T11:00:00.000Z"),
        },
        {
          kind: "recommendation_skipped",
          metadata: { recommendationKey: "second", reason: "No disponible" },
          occurredAt: new Date("2026-08-22T11:05:00.000Z"),
        },
      ]),
    ).toEqual({
      shown: 2,
      completed: 1,
      skipped: 1,
      complianceRate: 50,
      averageReactionMinutes: 10,
    });
  });
});

it("builds an immutable server policy snapshot when economic truth is unavailable", () => {
  expect(buildServerEvidenceSnapshot("no_contact", new Date("2026-08-25T10:00:00.000Z"))).toEqual({
    policyVersion: "commercial-evidence-v1", asOf: "2026-08-25T10:00:00.000Z", target: "sale",
    probabilityBps: null, expectedMarginCents: null, currency: null, fallback: "unavailable", sample: 0,
    confidence: "insufficient", features: { actionType: "no_contact" }, status: "economic_truth_missing",
  });
});

it("treats completion and skipping as terminal lifecycle outcomes", async () => {
  const { terminalRecommendationKinds } = await import("./next-best-action-events");
  expect(terminalRecommendationKinds.has("recommendation_completed")).toBe(true);
  expect(terminalRecommendationKinds.has("recommendation_skipped")).toBe(true);
  expect(terminalRecommendationKinds.has("recommendation_opened")).toBe(false);
});

it("parses only epoch-bound recurring alert keys", async () => {
  const { parseAlertRecommendationKey } = await import("./next-best-action-events");
  expect(parseAlertRecommendationKey("alert:alert-1:2026-08-22T11:00:00.000Z")).toEqual({ alertId: "alert-1", nextShowAt: new Date("2026-08-22T11:00:00.000Z") });
  expect(parseAlertRecommendationKey("alert:alert-1")).toBeNull();
});

it("calculates compliance from resolved recommendations, not impressions", () => {
  expect(buildRecommendationMetrics([
    ...Array.from({ length: 5 }, (_, index) => ({ kind: "recommendation_shown" as const, metadata: { recommendationKey: `shown-${index}` }, occurredAt: new Date("2026-08-22T10:00:00.000Z") })),
    { kind: "recommendation_completed" as const, metadata: { recommendationKey: "shown-0" }, occurredAt: new Date("2026-08-22T10:01:00.000Z") },
    { kind: "recommendation_skipped" as const, metadata: { recommendationKey: "shown-1", reason: "No disponible" }, occurredAt: new Date("2026-08-22T10:02:00.000Z") },
  ]).complianceRate).toBe(50);
});
