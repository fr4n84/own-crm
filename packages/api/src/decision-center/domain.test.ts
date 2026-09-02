import { describe, expect, it } from "vitest";

import {
  buildWeeklyDecisionCandidates,
  freezeQualityThresholds,
  madridWeekBounds,
  nextDecisionStatus,
  profitabilityFingerprint,
  rankWeeklyDecisionCandidates,
  type DecisionSignal,
} from "./domain";

describe("weekly decision center domain", () => {
  it("orders signals deterministically, caps the snapshot at five and deduplicates fingerprints", () => {
    const signals: DecisionSignal[] = Array.from({ length: 7 }, (_, index) => ({
      sourceType: "quality_control",
      sourceFingerprint: index === 6 ? "quality:0" : `quality:${index}`,
      title: `Decision ${index}`,
      summary: "Evidence",
      scope: "team",
      priority: index === 0 ? "critical" : "medium",
      evidence: { count: index + 1 },
      estimatedImpactCents: null,
      confidencePercent: null,
      sampleSize: index + 1,
    }));

    const decisions = buildWeeklyDecisionCandidates(signals);

    expect(decisions).toHaveLength(5);
    expect(decisions[0]?.sourceFingerprint).toBe("quality:0");
    expect(new Set(decisions.map((decision) => decision.sourceFingerprint)).size).toBe(5);
    expect(rankWeeklyDecisionCandidates(decisions).map((decision) => decision.rank)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("accepts only the human lifecycle transitions", () => {
    expect(nextDecisionStatus("proposed", "approve")).toBe("approved");
    expect(nextDecisionStatus("proposed", "reject")).toBe("rejected");
    expect(nextDecisionStatus("approved", "start")).toBe("in_progress");
    expect(nextDecisionStatus("in_progress", "complete")).toBe("completed");
    expect(() => nextDecisionStatus("proposed", "complete")).toThrow(
      "Invalid decision transition",
    );
    expect(() => nextDecisionStatus("completed", "start")).toThrow(
      "Invalid decision transition",
    );
  });

  it("uses collision-safe canonical profitability fingerprints", () => {
    expect(profitabilityFingerprint("Meta:Spain", "August", "reduce")).not.toBe(
      profitabilityFingerprint("Meta", "Spain:August", "reduce"),
    );
    expect(profitabilityFingerprint("Meta", "Spain:August", "reduce")).toBe(
      profitabilityFingerprint("Meta", "Spain:August", "reduce"),
    );
  });

  it("computes Europe/Madrid Monday boundaries across CET and CEST", () => {
    const springTransitionWeek = madridWeekBounds(new Date("2026-03-29T12:00:00.000Z"));
    expect(springTransitionWeek.start.toISOString()).toBe(
      "2026-03-22T23:00:00.000Z",
    );
    expect(springTransitionWeek.end.toISOString()).toBe(
      "2026-03-29T21:59:59.999Z",
    );
    expect(madridWeekBounds(new Date("2026-03-29T22:30:00.000Z")).start.toISOString()).toBe(
      "2026-03-29T22:00:00.000Z",
    );
    expect(madridWeekBounds(new Date("2026-10-25T12:00:00.000Z")).start.toISOString()).toBe(
      "2026-10-18T22:00:00.000Z",
    );
    expect(madridWeekBounds(new Date("2026-10-25T23:30:00.000Z")).start.toISOString()).toBe(
      "2026-10-25T23:00:00.000Z",
    );
  });

  it("freezes only quality thresholds and omits audit metadata", () => {
    expect(freezeQualityThresholds({
      id: "global",
      callerAbandonedHours: 24,
      closerAbandonedHours: 48,
      callerFollowUpGraceHours: 1,
      closerFollowUpGraceHours: 2,
      callerLowConversionPercent: 20,
      closerLowConversionPercent: 25,
      updatedById: "admin",
      updatedAt: new Date(),
    })).toEqual({
      callerAbandonedHours: 24,
      closerAbandonedHours: 48,
      callerFollowUpGraceHours: 1,
      closerFollowUpGraceHours: 2,
      callerLowConversionPercent: 20,
      closerLowConversionPercent: 25,
    });
  });
});
