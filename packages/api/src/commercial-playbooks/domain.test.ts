import { describe, expect, it } from "vitest";

import {
  buildCommercialPlaybookCandidates,
  COMMERCIAL_PLAYBOOK_POLICY_VERSION,
  type PlaybookEvidenceFacts,
} from "./domain";

const asOf = new Date("2026-08-26T12:00:00.000Z");

function feedback(index: number, occurredAt = new Date("2026-06-01T10:00:00.000Z")) {
  return {
    id: `feedback-${index}`,
    leadId: `lead-${index}`,
    occurredAt,
    metadata: {
      summary: "free text must never be evidence",
      extraInfo: "transcript must never be evidence",
      questions: [
        { questionKey: "primaryProfile", answer: "parado_desempleado" },
        { questionKey: "objectionTypes", answer: JSON.stringify(["price", "invented_free_text"]) },
        { questionKey: "motivationAngles", answer: JSON.stringify(["financial_stability"]) },
      ],
    },
  };
}

function facts(overrides: Partial<PlaybookEvidenceFacts> = {}): PlaybookEvidenceFacts {
  return {
    asOf,
    feedbackEvents: Array.from({ length: 30 }, (_, index) => feedback(index)),
    outcomeEvents: Array.from({ length: 6 }, (_, index) => ({ id: `sale-${index}`, leadId: `lead-${index}`, kind: "sale" as const, occurredAt: new Date("2026-06-20T10:00:00.000Z") })),
    libraryVersions: [],
    experiments: [],
    ...overrides,
  };
}

function experimentFixture(overrides: Partial<PlaybookEvidenceFacts["experiments"][number]> = {}) {
  const assignments = [
    ...Array.from({ length: 40 }, (_, index) => ({ id: `c-${index}`, leadId: `c-lead-${index}`, arm: "control" as const, enrolledAt: new Date("2026-05-01T00:00:00.000Z"), treatmentAppliedAt: null })),
    ...Array.from({ length: 40 }, (_, index) => ({ id: `t-${index}`, leadId: `t-lead-${index}`, arm: "treatment" as const, enrolledAt: new Date("2026-05-01T00:00:00.000Z"), treatmentAppliedAt: new Date("2026-05-01T00:00:01.000Z") })),
  ];
  const outcomes = [
    ...Array.from({ length: 2 }, (_, index) => ({ id: `co-${index}`, leadId: `c-lead-${index}`, kind: "sale" as const, occurredAt: new Date("2026-05-20T00:00:00.000Z") })),
    ...Array.from({ length: 20 }, (_, index) => ({ id: `to-${index}`, leadId: `t-lead-${index}`, kind: "sale" as const, occurredAt: new Date("2026-05-20T00:00:00.000Z") })),
  ];
  return {
    id: "experiment-1", status: "completed", finalDecision: "approved", primaryMetric: "sale" as const,
    finalDecisionById: "admin-1", finalDecisionAt: new Date("2026-08-01T01:00:00.000Z"),
    maturationDays: 30, minimumSamplePerArm: 30, guardrailTolerancePp: 0,
    endedAt: new Date("2026-08-01T00:00:00.000Z"), treatmentConfig: { libraryVersionId: "library-v1" },
    assignments, outcomes, ...overrides,
  };
}

describe("learning playbook evidence", () => {
  it("uses only confirmed taxonomies and excludes future feedback and free text", () => {
    const result = buildCommercialPlaybookCandidates(facts({
      feedbackEvents: [...facts().feedbackEvents, feedback(100, new Date("2026-09-01T00:00:00.000Z"))],
    }));

    expect(result.candidates.some((candidate) => candidate.targeting.objections?.includes("price"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("invented_free_text");
    expect(JSON.stringify(result)).not.toContain("free text must never be evidence");
    expect(JSON.stringify(result)).not.toContain("transcript must never be evidence");
    expect(JSON.stringify(result)).not.toContain("feedback-100");
  });

  it("uses unique leads as the observational sample instead of repeated feedback events", () => {
    const repeated = Array.from({ length: 30 }, (_, index) => ({
      ...feedback(index),
      leadId: "same-lead",
    }));
    const result = buildCommercialPlaybookCandidates(facts({ feedbackEvents: repeated }));
    const candidate = result.candidates.find((item) => item.source === "observational_gap");

    expect(candidate?.evidenceSnapshot.sampleSize).toBe(1);
    expect(candidate?.evidenceSnapshot.denominators).toEqual({ matureFeedbacks: 1 });
    expect(candidate?.availability).toBe("insufficient");
  });

  it("deduplicates repeated feedback inside one verified assignment epoch", () => {
    const repeated = Array.from({ length: 30 }, (_, index) => ({
      ...feedback(index),
      leadId: "same-lead",
      assignmentEpoch: "assignment-1",
    }));
    const candidate = buildCommercialPlaybookCandidates(facts({ feedbackEvents: repeated })).candidates.find((item) => item.source === "observational_gap");

    expect(candidate?.evidenceSnapshot.sampleSize).toBe(1);
    expect(candidate?.availability).toBe("insufficient");
  });

  it("counts two verified assignment epochs for the same lead as two observational units", () => {
    const epochs = [
      { ...feedback(1), leadId: "same-lead", assignmentEpoch: "assignment-1" },
      { ...feedback(2, new Date("2026-06-15T10:00:00.000Z")), leadId: "same-lead", assignmentEpoch: "assignment-2" },
    ];
    const candidate = buildCommercialPlaybookCandidates(facts({ feedbackEvents: epochs })).candidates.find((item) => item.source === "observational_gap");

    expect(candidate?.evidenceSnapshot.sampleSize).toBe(2);
    expect(candidate?.evidenceSnapshot.denominators).toEqual({ matureFeedbacks: 2 });
  });

  it("freezes observational outcomes at the event maturity horizon and the server as-of", () => {
    const result = buildCommercialPlaybookCandidates(facts({
      outcomeEvents: [
        ...facts().outcomeEvents,
        { id: "before-feedback", leadId: "lead-6", kind: "sale", occurredAt: new Date("2026-05-31T10:00:00.000Z") },
        { id: "after-maturity", leadId: "lead-7", kind: "sale", occurredAt: new Date("2026-07-02T10:00:00.000Z") },
        { id: "after-as-of", leadId: "lead-8", kind: "sale", occurredAt: new Date("2026-09-01T10:00:00.000Z") },
      ],
    }));
    const price = result.candidates.find((candidate) => candidate.targeting.objections?.includes("price"));

    expect(price?.evidenceSnapshot.rates.saleRate).toBe(0.2);
    expect(price?.evidenceSnapshot.evidenceIds).not.toContain("before-feedback");
    expect(price?.evidenceSnapshot.evidenceIds).not.toContain("after-maturity");
    expect(price?.evidenceSnapshot.evidenceIds).not.toContain("after-as-of");
  });

  it("marks observational cohorts below 30 mature feedbacks as insufficient and never causal", () => {
    const result = buildCommercialPlaybookCandidates(facts({ feedbackEvents: Array.from({ length: 29 }, (_, index) => feedback(index)) }));
    const price = result.candidates.find((candidate) => candidate.targeting.objections?.includes("price"));

    expect(price?.availability).toBe("insufficient");
    expect(price?.evidenceSnapshot.sampleSize).toBe(29);
    expect(price?.evidenceSnapshot.evidenceLabel).toBe("observational");
    expect(price?.evidenceSnapshot.confidence).toBe("insufficient");
  });

  it("freezes cutoff, policy, cohort fingerprint, denominators and evidence ids", () => {
    const price = buildCommercialPlaybookCandidates(facts()).candidates.find((candidate) => candidate.targeting.objections?.includes("price"));

    expect(price).toMatchObject({ availability: "ready", source: "observational_gap" });
    expect(price?.evidenceSnapshot).toMatchObject({
      policyVersion: COMMERCIAL_PLAYBOOK_POLICY_VERSION,
      sampleSize: 30,
      denominators: { matureFeedbacks: 30 },
      evidenceLabel: "observational",
      confidence: "observational",
    });
    expect(price?.evidenceSnapshot.cohortFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(price?.evidenceSnapshot.evidenceIds).toHaveLength(36);
    expect(price?.evidenceSnapshot.evidenceIds.filter((id) => id.startsWith("feedback:"))).toHaveLength(30);
    expect(price?.evidenceSnapshot.evidenceIds.filter((id) => id.startsWith("outcome:"))).toHaveLength(6);
    expect(price?.candidateKey).toMatch(/^playbook:[a-f0-9]{64}$/);
  });

  it("changes material identity for outcome backfills but keeps it stable across empty clock ticks", () => {
    const baseline = buildCommercialPlaybookCandidates(facts()).candidates.find((candidate) => candidate.targeting.objections?.includes("price"))!;
    const backfilled = buildCommercialPlaybookCandidates(facts({
      outcomeEvents: [...facts().outcomeEvents, { id: "sale-backfill", leadId: "lead-0", kind: "sale", occurredAt: new Date("2026-06-21T10:00:00.000Z") }],
    })).candidates.find((candidate) => candidate.targeting.objections?.includes("price"))!;
    const laterAsOf = buildCommercialPlaybookCandidates(facts({ asOf: new Date(asOf.getTime() + 1) })).candidates.find((candidate) => candidate.targeting.objections?.includes("price"))!;

    expect(backfilled.evidenceSnapshot.rates.saleRate).toBe(baseline.evidenceSnapshot.rates.saleRate);
    expect(backfilled.evidenceSnapshot.cohortFingerprint).not.toBe(baseline.evidenceSnapshot.cohortFingerprint);
    expect(backfilled.candidateKey).not.toBe(baseline.candidateKey);
    expect(backfilled.proposalLineageKey).toBe(baseline.proposalLineageKey);
    expect(laterAsOf.evidenceSnapshot.asOf).not.toBe(baseline.evidenceSnapshot.asOf);
    expect(laterAsOf.evidenceSnapshot.cutoff).not.toBe(baseline.evidenceSnapshot.cutoff);
    expect(laterAsOf.evidenceSnapshot.cohortFingerprint).toBe(baseline.evidenceSnapshot.cohortFingerprint);
    expect(laterAsOf.candidateKey).toBe(baseline.candidateKey);
    expect(laterAsOf.proposalLineageKey).toBe(baseline.proposalLineageKey);
  });

  it("creates an independent observational lineage instead of overwriting an unrelated profile playbook", () => {
    const existing = { id: "existing-v1", lineageKey: "existing", version: 1, status: "published" as const, type: "playbook", title: "General", content: "General", targeting: { profile: "parado_desempleado" }, evidence: {} };
    const price = buildCommercialPlaybookCandidates(facts({ libraryVersions: [existing] })).candidates.find((candidate) => candidate.targeting.objections?.includes("price"));

    expect(price).toMatchObject({ baseLibraryVersionId: null });
    expect(price?.libraryLineageKey).toMatch(/^learned:/);
  });

  it("does not create an experimental proposal without an explicit library-version treatment binding", () => {
    const result = buildCommercialPlaybookCandidates(facts({ experiments: [{
      id: "experiment-1", status: "completed", finalDecision: "approved", primaryMetric: "sale", maturationDays: 30,
      finalDecisionById: "admin-1", finalDecisionAt: new Date("2026-08-01T01:00:00.000Z"),
      minimumSamplePerArm: 1, guardrailTolerancePp: 0, endedAt: new Date("2026-08-01T00:00:00.000Z"), treatmentConfig: {}, assignments: [], outcomes: [],
    }] }));

    expect(result.candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
    expect(result.limitations).toContain("Los experimentos sin libraryVersionId explícito no pueden atribuir aprendizaje a un playbook.");
  });

  it("accepts experimental support only with mature applied treatment, positive CI and no harm", () => {
    const library = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const result = buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [experimentFixture()] }));
    const proposal = result.candidates.find((candidate) => candidate.source === "approved_experiment");

    expect(proposal).toMatchObject({ availability: "ready", baseLibraryVersionId: "library-v1", experimentSourceId: "experiment-1" });
    expect(proposal?.evidenceSnapshot.evidenceLabel).toBe("experimental");
    expect(proposal?.evidenceSnapshot.confidence).toBe("experiment_supported");
    expect(proposal?.evidenceSnapshot.confidenceInterval95?.lowerPp).toBeGreaterThan(0);
  });

  it("changes experimental fingerprint when a qualifying outcome is backfilled without changing the rate", () => {
    const library = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const experiment = experimentFixture();
    const baseline = buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [experiment] })).candidates.find((candidate) => candidate.source === "approved_experiment")!;
    const backfilledExperiment = experimentFixture({
      outcomes: [...experiment.outcomes, { id: "outcome-backfill", leadId: "t-lead-0", kind: "sale", occurredAt: new Date("2026-05-21T00:00:00.000Z") }],
    });
    const backfilled = buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [backfilledExperiment] })).candidates.find((candidate) => candidate.source === "approved_experiment")!;

    expect(backfilled.evidenceSnapshot.rates).toEqual(baseline.evidenceSnapshot.rates);
    expect(backfilled.evidenceSnapshot.cohortFingerprint).not.toBe(baseline.evidenceSnapshot.cohortFingerprint);
    expect(backfilled.candidateKey).not.toBe(baseline.candidateKey);
  });

  it("rejects experimental support from unpublished or non-playbook library versions", () => {
    const draft = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "draft" as const, type: "playbook", title: "Draft", content: "Draft", targeting: {}, evidence: {} };
    const script = { ...draft, status: "published" as const, type: "script" };

    expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [draft], experiments: [experimentFixture()] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
    expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [script], experiments: [experimentFixture()] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
  });

  it("rejects experimental support when the explicitly tested base is no longer current", () => {
    const base = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const current = { ...base, id: "library-v2", version: 2, title: "Current" };

    expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [base, current], experiments: [experimentFixture()] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
  });

  it("requires at least 30 mature assignments in each experimental arm", () => {
    const library = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const experiment = experimentFixture({ minimumSamplePerArm: 1 });
    experiment.assignments = experiment.assignments.filter((assignment) => Number(assignment.id.split("-")[1]) < 29);

    expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [experiment] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
  });

  it("rejects treatment compliance recorded after the experiment cutoff", () => {
    const library = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const experiment = experimentFixture();
    experiment.assignments = experiment.assignments.map((assignment) => assignment.arm === "treatment"
      ? { ...assignment, treatmentAppliedAt: new Date("2026-08-02T00:00:00.000Z") }
      : assignment);

    expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [experiment] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
  });

  it("requires treatment application inside each assignment maturity window", () => {
    const library = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const experiment = experimentFixture();
    experiment.assignments = experiment.assignments.map((assignment) => assignment.arm === "treatment"
      ? { ...assignment, treatmentAppliedAt: new Date("2026-06-01T00:00:00.000Z") }
      : assignment);

    expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [experiment] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
  });

  it("does not credit outcomes that happened before the tested playbook was applied", () => {
    const library = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const experiment = experimentFixture();
    experiment.assignments = experiment.assignments.map((assignment) => assignment.arm === "treatment"
      ? { ...assignment, treatmentAppliedAt: new Date("2026-05-25T00:00:00.000Z") }
      : assignment);

    expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [experiment] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
  });

  it("requires a human experiment decision recorded after completion and before as-of", () => {
    const library = { id: "library-v1", lineageKey: "lineage-1", version: 1, status: "published" as const, type: "playbook", title: "Base", content: "Base", targeting: {}, evidence: {} };
    const beforeCompletion = experimentFixture({ finalDecisionAt: new Date("2026-07-31T23:59:59.000Z") });
    const afterAsOf = experimentFixture({ finalDecisionAt: new Date("2026-08-27T00:00:00.000Z") });
    const anonymous = experimentFixture({ finalDecisionById: null });

    for (const experiment of [beforeCompletion, afterAsOf, anonymous]) {
      expect(buildCommercialPlaybookCandidates(facts({ libraryVersions: [library], experiments: [experiment] })).candidates.some((candidate) => candidate.source === "approved_experiment")).toBe(false);
    }
  });
});
