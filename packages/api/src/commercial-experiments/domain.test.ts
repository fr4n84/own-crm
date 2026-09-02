import { describe, expect, it } from "vitest";

import {
  allocateCommercialExperimentArm,
  analyzeCommercialExperiment,
  COMMERCIAL_EXPERIMENT_CONFIDENCE_INTERVAL_METHOD,
  deriveCommercialExperimentOutcomes,
  hasCommercialExperimentConflict,
  isEligibleForCommercialExperiment,
  stableCommercialExperimentHash,
} from "./domain";

const at = (value: string) => new Date(value);
const enrolledAt = at("2026-08-01T00:00:00.000Z");

const assignment = (arm: "control" | "treatment", overrides: Partial<{ id: string; enrolledAt: Date; treatmentAppliedAt: Date | null; outcomes: { kind: "contacted" | "appointment" | "show" | "sale"; occurredAt: Date }[] }> = {}) => ({
  id: `${arm}-${Math.random()}`,
  arm,
  enrolledAt,
  treatmentAppliedAt: arm === "treatment" ? enrolledAt : null,
  outcomes: [],
  ...overrides,
});

describe("commercial experiment domain", () => {
  it("uses a deterministic stable hash and honours allocation percentage boundaries", () => {
    expect(stableCommercialExperimentHash("experiment:lead")).toBe(stableCommercialExperimentHash("experiment:lead"));
    expect(allocateCommercialExperimentArm({ experimentId: "experiment", leadId: "lead", allocationPercent: 0 })).toBe("control");
    expect(allocateCommercialExperimentArm({ experimentId: "experiment", leadId: "lead", allocationPercent: 100 })).toBe("treatment");
    expect(allocateCommercialExperimentArm({ experimentId: "experiment", leadId: "lead", allocationPercent: 50 })).toBe(allocateCommercialExperimentArm({ experimentId: "experiment", leadId: "lead", allocationPercent: 50 }));
  });

  it("matches all populated eligibility filters and detects only same-intervention conflicts", () => {
    expect(isEligibleForCommercialExperiment({ eligibility: { profiles: ["A"], sources: ["Meta"], campaigns: ["C1"], types: ["vsl"] }, lead: { profile: "A", source: "Meta", campaign: "C1", type: "vsl" } })).toBe(true);
    expect(isEligibleForCommercialExperiment({ eligibility: { sources: ["Google"] }, lead: { profile: "A", source: "Meta", campaign: "C1", type: "vsl" } })).toBe(false);
    expect(isEligibleForCommercialExperiment({ eligibility: null, lead: { profile: null, source: null, campaign: null, type: "maestra" } })).toBe(true);
    expect(hasCommercialExperimentConflict({ interventionType: "assignment_routing", activeInterventionTypes: ["assignment_routing"] })).toBe(true);
    expect(hasCommercialExperimentConflict({ interventionType: "assignment_routing", activeInterventionTypes: ["speed_priority"] })).toBe(false);
  });

  it("deduplicates funnel outcomes strictly after enrollment and before the cutoff", () => {
    expect(deriveCommercialExperimentOutcomes({
      enrolledAt,
      cutoff: at("2026-08-10T00:00:00.000Z"),
      events: [
        { kind: "contacted", occurredAt: enrolledAt },
        { kind: "contacted", occurredAt: at("2026-08-02T00:00:00.000Z") },
        { kind: "contacted", occurredAt: at("2026-08-03T00:00:00.000Z") },
        { kind: "appointment", occurredAt: at("2026-08-04T00:00:00.000Z") },
        { kind: "show", occurredAt: at("2026-08-05T00:00:00.000Z") },
        { kind: "sale", occurredAt: at("2026-08-06T00:00:00.000Z") },
        { kind: "sale", occurredAt: at("2026-08-10T00:00:00.000Z") },
      ],
    })).toEqual({ contacted: true, appointment: true, show: true, sale: true });
  });

  it("excludes unmatured assignments from arm funnels and never declares a winner below minimum samples", () => {
    const result = analyzeCommercialExperiment({
      assignments: [
        assignment("control", { outcomes: [{ kind: "sale", occurredAt: at("2026-08-02T00:00:00.000Z") }] }),
        assignment("treatment", { outcomes: [{ kind: "sale", occurredAt: at("2026-08-02T00:00:00.000Z") }] }),
        assignment("treatment", { enrolledAt: at("2026-08-09T00:00:00.000Z"), outcomes: [{ kind: "sale", occurredAt: at("2026-08-09T12:00:00.000Z") }] }),
      ],
      now: at("2026-08-10T00:00:00.000Z"),
      maturationDays: 7,
      minimumSamplePerArm: 2,
      primaryMetric: "sale",
      guardrailTolerancePp: 5,
    });

    expect(result.maturedAssignments).toBe(2);
    expect(result.arms.control.sampleSize).toBe(1);
    expect(result.arms.treatment.sampleSize).toBe(1);
    expect(result.state).toBe("insufficient");
  });

  it("calculates funnel rates, pp and relative uplift, and a bounded Newcombe-Wilson confidence interval", () => {
    const result = analyzeCommercialExperiment({
      assignments: [
        ...Array.from({ length: 100 }, (_, index) => assignment("control", { id: `c-${index}`, outcomes: index < 10 ? [{ kind: "sale", occurredAt: at("2026-08-02T00:00:00.000Z") }] : [] })),
        ...Array.from({ length: 100 }, (_, index) => assignment("treatment", { id: `t-${index}`, outcomes: index < 40 ? [{ kind: "sale", occurredAt: at("2026-08-02T00:00:00.000Z") }] : [] })),
      ],
      now: at("2026-08-10T00:00:00.000Z"), maturationDays: 7, minimumSamplePerArm: 10, primaryMetric: "sale", guardrailTolerancePp: 5,
    });

    expect(result.arms.control.funnel.sale).toEqual({ count: 10, rate: 0.1 });
    expect(result.primary.absolutePpUplift).toBeCloseTo(30);
    expect(result.primary.relativeUplift).toBeCloseTo(3);
    expect(result.primary.confidenceInterval95.lowerPp).toBeGreaterThan(0);
    expect(result.primary.confidenceInterval95.lowerPp).toBeCloseTo(18.278917067456295, 8);
    expect(result.primary.confidenceInterval95.upperPp).toBeCloseTo(40.77400722293019, 8);
    expect(result.primary.confidenceInterval95.method).toBe(COMMERCIAL_EXPERIMENT_CONFIDENCE_INTERVAL_METHOD);
    expect(result.state).toBe("candidate_winner");

    const zeroControl = analyzeCommercialExperiment({
      assignments: [assignment("control"), assignment("treatment", { outcomes: [{ kind: "sale", occurredAt: at("2026-08-02T00:00:00.000Z") }] })],
      now: at("2026-08-10T00:00:00.000Z"), maturationDays: 7, minimumSamplePerArm: 1, primaryMetric: "sale", guardrailTolerancePp: 5,
    });
    expect(zeroControl.primary.relativeUplift).toBeNull();
    expect(zeroControl.primary.confidenceInterval95.lowerPp).not.toBeNaN();
  });

  it("keeps Wilson-Newcombe intervals finite, bounded, and symmetric for boundary and small cohorts", () => {
    const analyze = (controlSales: number, treatmentSales: number, size = 1) => analyzeCommercialExperiment({
      assignments: [
        ...Array.from({ length: size }, (_, index) => assignment("control", { id: `c-${controlSales}-${index}`, outcomes: index < controlSales ? [{ kind: "sale", occurredAt: at("2026-08-02T00:00:00.000Z") }] : [] })),
        ...Array.from({ length: size }, (_, index) => assignment("treatment", { id: `t-${treatmentSales}-${index}`, outcomes: index < treatmentSales ? [{ kind: "sale", occurredAt: at("2026-08-02T00:00:00.000Z") }] : [] })),
      ], now: at("2026-08-10T00:00:00.000Z"), maturationDays: 7, minimumSamplePerArm: 1, primaryMetric: "sale", guardrailTolerancePp: 100,
    });
    for (const result of [analyze(0, 0), analyze(1, 1), analyze(0, 1), analyze(1, 0)]) {
      expect(result.primary.confidenceInterval95.lowerPp).toBeGreaterThanOrEqual(-100);
      expect(result.primary.confidenceInterval95.upperPp).toBeLessThanOrEqual(100);
    }
    const zero = analyze(0, 0).primary.confidenceInterval95;
    expect(zero.lowerPp).toBeCloseTo(-zero.upperPp!);
    expect(analyze(0, 1).state).not.toBe("candidate_winner");
  });

  it("flags guardrail harm and reports treatment compliance", () => {
    const result = analyzeCommercialExperiment({
      assignments: [
        ...Array.from({ length: 20 }, (_, index) => assignment("control", { id: `c-${index}`, outcomes: index < 10 ? [{ kind: "contacted", occurredAt: at("2026-08-02T00:00:00.000Z") }] : [] })),
        ...Array.from({ length: 20 }, (_, index) => assignment("treatment", { id: `t-${index}`, treatmentAppliedAt: index < 15 ? enrolledAt : null, outcomes: index < 2 ? [{ kind: "contacted", occurredAt: at("2026-08-02T00:00:00.000Z") }] : [] })),
      ],
      now: at("2026-08-10T00:00:00.000Z"), maturationDays: 7, minimumSamplePerArm: 10, primaryMetric: "contacted", guardrailTolerancePp: 10,
    });

    expect(result.guardrail.isHarm).toBe(true);
    expect(result.compliance).toEqual({ applied: 15, eligible: 20, rate: 0.75 });
    expect(result.state).toBe("candidate_harm");
  });
});
