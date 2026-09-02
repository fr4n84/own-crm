import { describe, expect, it } from "vitest";

import { createCommercialExperimentsService, type CommercialExperimentsRepository, type ExperimentRecord } from "./service";

const at = (value: string) => new Date(value);
const admin = { actorId: "admin", permissions: ["*"] };
const baseExperiment = {
  id: "exp-1", name: "Routing test", hypothesis: "A faster response raises sales", interventionType: "assignment_routing" as const,
  primaryMetric: "sale" as const, eligibility: { profiles: ["A"] }, treatmentConfig: { policy: "routing" }, treatmentInstructions: { message: "Use priority queue" },
  allocationPercent: 50, minimumSamplePerArm: 1, maturationDays: 7, guardrailTolerancePp: 5, createdById: "admin", status: "draft" as const,
  startedAt: null, endedAt: null, finalDecision: null, finalDecisionById: null, finalDecisionAt: null, finalDecisionNotes: null, createdAt: at("2026-08-01T00:00:00Z"), updatedAt: at("2026-08-01T00:00:00Z"),
};

function repository(): CommercialExperimentsRepository & { experiments: Map<string, import("./service").ExperimentRecord>; assignments: any[]; writes: string[]; leads: any[] } {
  const experiments = new Map<string, ExperimentRecord>([[baseExperiment.id, { ...baseExperiment }]]);
  const assignments: any[] = [];
  const leads = [
    { id: "lead-a", profile: "A", source: "Meta", campaign: "C1", type: "vsl", callerId: "caller-before", closerId: "closer-before", createdAt: at("2026-08-01T00:00:00Z"), recommendedCallerId: "caller-recommended", recommendedCloserId: null },
    { id: "lead-b", profile: "A", source: "Google", campaign: "C2", type: "maestra", callerId: null, closerId: null, createdAt: at("2026-08-02T00:00:00Z"), recommendedCallerId: null, recommendedCloserId: "closer-recommended" },
  ];
  const writes: string[] = [];
  return {
    experiments, assignments, leads, writes,
    async transaction(work) { return work(this); },
    async createExperiment(value) { writes.push("experiments"); experiments.set(value.id, value as typeof baseExperiment); return value; },
    async findExperiment(id) { return experiments.get(id) ?? null; },
    async lockExperiment(id) { return experiments.get(id) ?? null; },
    async listExperiments() { return [...experiments.values()]; },
    async updateExperiment(id, patch, condition) { writes.push("experiments"); const value = experiments.get(id); if (!value || (condition?.expectedStatus && value.status !== condition.expectedStatus) || (condition?.requireNoFinalDecision && value.finalDecision !== null)) return null; const next = { ...value, ...patch, updatedAt: new Date() }; experiments.set(id, next); return next; },
    async findEligibleLeads() { return leads; },
    async findAssignments(experimentId) { return assignments.filter((assignment) => assignment.experimentId === experimentId); },
    async findConflictingLeadIds(input) { return new Set(assignments.filter((assignment) => assignment.experimentId !== input.experimentId && assignment.activeInterventionType === input.interventionType).map((assignment) => assignment.leadId)); },
    async lockLeadInterventions() {},
    async insertAssignments(values) { writes.push("assignments"); let inserted = 0; for (const value of values) if (!assignments.some((assignment) => assignment.experimentId === value.experimentId && assignment.leadId === value.leadId)) { assignments.push(value); inserted += 1; } return { inserted, existing: values.length - inserted }; },
    async markTreatmentApplied(input) { writes.push("assignments"); const value = assignments.find((assignment) => assignment.id === input.assignmentId); const owner = value ? experiments.get(value.experimentId) : null; if (!value || owner?.status !== "active" || value.arm !== "treatment" || value.treatmentAppliedAt) return null; value.treatmentAppliedAt = input.at; value.treatmentAppliedById = input.actorId; return value; },
    async findOutcomeEvents() { return [{ leadId: "lead-a", kind: "sale" as const, occurredAt: at("2026-08-04T00:00:00Z") }, { leadId: "lead-a", kind: "sale" as const, occurredAt: at("2026-08-01T00:00:00Z") }]; },
  };
}

describe("commercial experiment service", () => {
  it("requires wildcard administration server-side", async () => {
    const service = createCommercialExperimentsService(repository());
    await expect(service.list({ actorId: "caller", permissions: ["leads:read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("activates a draft, atomically enrolls eligible leads, and retries idempotently with frozen context", async () => {
    const repo = repository(); const service = createCommercialExperimentsService(repo);
    const activated = await service.activate({ ...admin, experimentId: "exp-1", now: at("2026-08-03T00:00:00Z") });
    expect(activated.status).toBe("active");
    expect(activated.enrollment).toEqual({ inserted: 2, existing: 0, conflicts: 0 });
    repo.leads[0].callerId = "caller-after";
    const retry = await service.enrollNew({ ...admin, experimentId: "exp-1", now: at("2026-08-04T00:00:00Z") });
    expect(retry).toEqual({ inserted: 0, existing: 2, conflicts: 0 });
    expect(repo.assignments[0].frozenContext).toMatchObject({ originalCallerId: "caller-before", recommendedCallerId: "caller-recommended" });
    await expect(service.updateDraft({ ...admin, experimentId: "exp-1", patch: { name: "No longer draft" } })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("skips leads enrolled in another active experiment with the same intervention type", async () => {
    const repo = repository(); repo.assignments.push({ id: "other", experimentId: "other-exp", leadId: "lead-a", activeInterventionType: "assignment_routing" });
    const service = createCommercialExperimentsService(repo);
    const result = await service.activate({ ...admin, experimentId: "exp-1", now: at("2026-08-03T00:00:00Z") });
    expect(result.enrollment).toEqual({ inserted: 1, existing: 0, conflicts: 1 });
  });

  it("serializes competing active experiments so one lead cannot enter both same-intervention cohorts", async () => {
    const repo = repository();
    repo.experiments.set("exp-1", { ...baseExperiment, status: "active", startedAt: at("2026-08-03T00:00:00Z") });
    repo.experiments.set("exp-2", { ...baseExperiment, id: "exp-2", name: "Other routing", status: "active", startedAt: at("2026-08-03T00:00:00Z") });
    repo.leads = [repo.leads[0]];
    repo.findEligibleLeads = async () => repo.leads;
    let conflictChecks = 0;
    repo.findConflictingLeadIds = async (input) => new Set(conflictChecks++ === 0 ? [] : input.leadIds);
    let tail = Promise.resolve();
    repo.transaction = async (work) => { const previous = tail; let release: () => void = () => {}; tail = new Promise((resolve) => { release = resolve; }); await previous; try { return await work(repo); } finally { release(); } };
    const service = createCommercialExperimentsService(repo);
    const [first, second] = await Promise.all([
      service.enrollNew({ ...admin, experimentId: "exp-1", now: at("2026-08-03T00:00:00Z") }),
      service.enrollNew({ ...admin, experimentId: "exp-2", now: at("2026-08-03T00:00:00Z") }),
    ]);
    expect(first.inserted + second.inserted).toBe(1);
    expect(first.conflicts + second.conflicts).toBe(1);
  });

  it("does not enroll from a stale active read after a concurrent stop wins the experiment row lock", async () => {
    const repo = repository();
    repo.experiments.set("exp-1", { ...baseExperiment, status: "active", startedAt: at("2026-08-03T00:00:00Z") });
    const locked = repo as CommercialExperimentsRepository & { lockExperiment(id: string): Promise<ExperimentRecord | null> };
    locked.lockExperiment = async () => ({ ...baseExperiment, status: "stopped", startedAt: at("2026-08-03T00:00:00Z"), endedAt: at("2026-08-04T00:00:00Z") });
    const service = createCommercialExperimentsService(repo);
    await expect(service.enrollNew({ ...admin, experimentId: "exp-1", now: at("2026-08-04T00:00:01Z") })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.assignments).toHaveLength(0);
    expect(repo.writes).not.toContain("assignments");
  });

  it("keeps control cohort treatment-free and makes treatment application idempotent", async () => {
    const repo = repository(); const service = createCommercialExperimentsService(repo);
    await service.activate({ ...admin, experimentId: "exp-1", now: at("2026-08-03T00:00:00Z") });
    const treatment = repo.assignments.find((item) => item.arm === "treatment");
    const control = repo.assignments.find((item) => item.arm === "control");
    if (!control) repo.assignments.push({ ...repo.assignments[0], id: "control-manual", arm: "control", treatmentAppliedAt: null, treatmentAppliedById: null });
    const controlAssignment = repo.assignments.find((item) => item.arm === "control");
    if (!treatment || !controlAssignment) throw new Error("test requires both allocation arms");
    await expect(service.markTreatmentApplied({ ...admin, assignmentId: controlAssignment.id, now: at("2026-08-03T01:00:00Z") })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await service.markTreatmentApplied({ ...admin, assignmentId: treatment.id, now: at("2026-08-03T01:00:00Z") })).toMatchObject({ applied: true });
    expect(await service.markTreatmentApplied({ ...admin, assignmentId: treatment.id, now: at("2026-08-03T02:00:00Z") })).toEqual({ applied: false });
    const detail = await service.detail({ ...admin, experimentId: "exp-1", now: at("2026-08-12T00:00:00Z") });
    expect(detail.assignments.find((item) => item.arm === "control")).not.toHaveProperty("treatmentInstructions");
    expect(detail.treatmentConfig).toEqual({ policy: "routing" });
  });

  it("uses immutable enrollment timing for intent-to-treat results and never mutates production records on decisions", async () => {
    const repo = repository(); const service = createCommercialExperimentsService(repo);
    await service.activate({ ...admin, experimentId: "exp-1", now: at("2026-08-03T00:00:00Z") });
    const detail = await service.detail({ ...admin, experimentId: "exp-1", now: at("2026-08-12T00:00:00Z") });
    expect(detail.results.maturedAssignments).toBe(2);
    expect(detail.results.arms.control.funnel.sale.count + detail.results.arms.treatment.funnel.sale.count).toBe(1);
    await service.complete({ ...admin, experimentId: "exp-1", now: at("2026-08-12T00:00:00Z") });
    await service.recordFinalDecision({ ...admin, experimentId: "exp-1", decision: "inconclusive", notes: "Insufficient evidence", now: at("2026-08-12T00:00:00Z") });
    expect(repo.writes.every((target) => target === "experiments" || target === "assignments")).toBe(true);
  });

  it("uses conditional updates to reject concurrent lifecycle and final-decision overwrites", async () => {
    const repo = repository(); const service = createCommercialExperimentsService(repo);
    await service.activate({ ...admin, experimentId: "exp-1", now: at("2026-08-03T00:00:00Z") });
    await service.stop({ ...admin, experimentId: "exp-1", now: at("2026-08-04T00:00:00Z") });
    await expect(service.stop({ ...admin, experimentId: "exp-1", now: at("2026-08-04T00:00:01Z") })).rejects.toMatchObject({ code: "CONFLICT" });
    await service.complete({ ...admin, experimentId: "exp-1", now: at("2026-08-05T00:00:00Z") });
    await service.recordFinalDecision({ ...admin, experimentId: "exp-1", decision: "approved", notes: "Reviewed", now: at("2026-08-05T00:00:00Z") });
    await expect(service.recordFinalDecision({ ...admin, experimentId: "exp-1", decision: "rejected", notes: "Overwrite", now: at("2026-08-05T00:00:01Z") })).rejects.toMatchObject({ code: "CONFLICT" });
    const treatment = repo.assignments.find((item) => item.arm === "treatment");
    if (!treatment) throw new Error("test requires treatment");
    expect(await service.markTreatmentApplied({ ...admin, assignmentId: treatment.id, now: at("2026-08-05T00:00:02Z") })).toEqual({ applied: false });
  });

  it("returns explicit maturity for each immutable cohort row", async () => {
    const repo = repository(); const service = createCommercialExperimentsService(repo);
    await service.activate({ ...admin, experimentId: "exp-1", now: at("2026-08-03T00:00:00Z") });
    repo.assignments[1].enrolledAt = at("2026-08-11T00:00:00Z");
    const detail = await service.detail({ ...admin, experimentId: "exp-1", now: at("2026-08-12T00:00:00Z") });
    expect(detail.assignments.map((item) => item.isMature).sort()).toEqual([false, true]);
  });
});
