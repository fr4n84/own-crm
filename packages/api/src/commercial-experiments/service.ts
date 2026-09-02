import { TRPCError } from "@trpc/server";

import {
  allocateCommercialExperimentArm,
  analyzeCommercialExperiment,
  isCommercialExperimentAssignmentMature,
  isEligibleForCommercialExperiment,
  type CommercialExperimentAssignment,
  type CommercialExperimentEligibility,
  type CommercialExperimentInterventionType,
  type CommercialExperimentOutcome,
} from "./domain";

export type ExperimentRecord = {
  id: string; name: string; hypothesis: string; interventionType: CommercialExperimentInterventionType; primaryMetric: CommercialExperimentOutcome; status: "draft" | "active" | "stopped" | "completed";
  eligibility: CommercialExperimentEligibility; treatmentConfig: Record<string, unknown>; treatmentInstructions: Record<string, unknown>; allocationPercent: number; minimumSamplePerArm: number; maturationDays: number; guardrailTolerancePp: number;
  createdById: string; startedAt: Date | null; endedAt: Date | null; finalDecision: "inconclusive" | "rejected" | "approved" | null; finalDecisionById: string | null; finalDecisionAt: Date | null; finalDecisionNotes: string | null; createdAt: Date; updatedAt: Date;
};
export type ExperimentLead = { id: string; profile: string | null; source: string | null; campaign: string | null; type: string; callerId: string | null; closerId: string | null; createdAt: Date; recommendedCallerId: string | null; recommendedCloserId: string | null };
export type ExperimentAssignment = Omit<CommercialExperimentAssignment, "outcomes"> & { experimentId: string; leadId: string; frozenContext: Record<string, unknown>; treatmentAppliedById: string | null; activeInterventionType?: CommercialExperimentInterventionType };
export type OutcomeRow = { leadId: string; kind: CommercialExperimentOutcome; occurredAt: Date };
type ExperimentStatus = ExperimentRecord["status"];
type ExperimentUpdateCondition = { expectedStatus?: ExperimentStatus; requireNoFinalDecision?: boolean };
export type CommercialExperimentsRepository = {
  transaction<T>(work: (repository: CommercialExperimentsRepository) => Promise<T>): Promise<T>;
  createExperiment(value: ExperimentRecord): Promise<ExperimentRecord>;
  findExperiment(id: string): Promise<ExperimentRecord | null>;
  lockExperiment(id: string): Promise<ExperimentRecord | null>;
  listExperiments(): Promise<ExperimentRecord[]>;
  updateExperiment(id: string, patch: Partial<ExperimentRecord>, condition?: ExperimentUpdateCondition): Promise<ExperimentRecord | null>;
  findEligibleLeads(experiment: ExperimentRecord): Promise<ExperimentLead[]>;
  findAssignments(experimentId: string): Promise<ExperimentAssignment[]>;
  findConflictingLeadIds(input: { experimentId: string; interventionType: CommercialExperimentInterventionType; leadIds: readonly string[] }): Promise<Set<string>>;
  lockLeadInterventions(input: { interventionType: CommercialExperimentInterventionType; leadIds: readonly string[] }): Promise<void>;
  insertAssignments(values: ExperimentAssignment[]): Promise<{ inserted: number; existing: number }>;
  markTreatmentApplied(input: { assignmentId: string; actorId: string; at: Date }): Promise<ExperimentAssignment | null>;
  findOutcomeEvents(input: { leadIds: readonly string[]; before: Date }): Promise<OutcomeRow[]>;
};

type Actor = { actorId: string; permissions: readonly string[] };
function admin(input: Actor) { if (!input.permissions.includes("*")) throw new TRPCError({ code: "FORBIDDEN", message: "Commercial experiments require wildcard administration" }); }
function missing(): never { throw new TRPCError({ code: "NOT_FOUND", message: "Commercial experiment not found" }); }
function conflict(message: string): never { throw new TRPCError({ code: "CONFLICT", message }); }

export function createCommercialExperimentsService(repository: CommercialExperimentsRepository) {
  async function experiment(id: string) { return (await repository.findExperiment(id)) ?? missing(); }
  async function enrollInTransaction(transaction: CommercialExperimentsRepository, input: Actor & { experimentId: string; now: Date }) {
      const value = await transaction.lockExperiment(input.experimentId);
      if (!value) missing();
      if (value.status !== "active") conflict("Only active experiments can enroll leads");
      const eligible = (await transaction.findEligibleLeads(value)).filter((lead) => isEligibleForCommercialExperiment({ eligibility: value.eligibility, lead }));
      await transaction.lockLeadInterventions({ interventionType: value.interventionType, leadIds: eligible.map((lead) => lead.id) });
      const conflicts = await transaction.findConflictingLeadIds({ experimentId: value.id, interventionType: value.interventionType, leadIds: eligible.map((lead) => lead.id) });
      const candidates = eligible.filter((lead) => !conflicts.has(lead.id));
      const assignments = candidates.map((lead) => ({
        id: crypto.randomUUID(), experimentId: value.id, leadId: lead.id, arm: allocateCommercialExperimentArm({ experimentId: value.id, leadId: lead.id, allocationPercent: value.allocationPercent }), enrolledAt: input.now,
        frozenContext: { profile: lead.profile, source: lead.source, campaign: lead.campaign, type: lead.type, originalCallerId: lead.callerId, originalCloserId: lead.closerId, leadCreatedAt: lead.createdAt.toISOString(), enrolledAt: input.now.toISOString(), recommendedCallerId: lead.recommendedCallerId, recommendedCloserId: lead.recommendedCloserId },
        treatmentAppliedAt: null, treatmentAppliedById: null,
      } satisfies ExperimentAssignment));
      const result = await transaction.insertAssignments(assignments);
      return { ...result, conflicts: conflicts.size };
  }
  async function enroll(input: Actor & { experimentId: string; now: Date }) {
    admin(input);
    return repository.transaction((transaction) => enrollInTransaction(transaction, input));
  }
  return {
    async list(input: Actor) { admin(input); return repository.listExperiments(); },
    async create(input: Actor & { value: Omit<ExperimentRecord, "createdById" | "status" | "startedAt" | "endedAt" | "finalDecision" | "finalDecisionById" | "finalDecisionAt" | "finalDecisionNotes" | "createdAt" | "updatedAt"> }) { admin(input); const now = new Date(); return repository.createExperiment({ ...input.value, createdById: input.actorId, status: "draft", startedAt: null, endedAt: null, finalDecision: null, finalDecisionById: null, finalDecisionAt: null, finalDecisionNotes: null, createdAt: now, updatedAt: now }); },
    async updateDraft(input: Actor & { experimentId: string; patch: Partial<Pick<ExperimentRecord, "name" | "hypothesis" | "eligibility" | "treatmentConfig" | "treatmentInstructions" | "allocationPercent" | "minimumSamplePerArm" | "maturationDays" | "guardrailTolerancePp">> }) { admin(input); const value = await experiment(input.experimentId); if (value.status !== "draft") conflict("Only draft experiments can be updated"); return (await repository.updateExperiment(value.id, input.patch, { expectedStatus: "draft" })) ?? conflict("Draft changed concurrently"); },
    async activate(input: Actor & { experimentId: string; now: Date }) { admin(input); return repository.transaction(async (transaction) => { const value = await transaction.lockExperiment(input.experimentId); if (!value) missing(); if (value.status !== "draft") conflict("Only draft experiments can be activated"); const active = await transaction.updateExperiment(value.id, { status: "active", startedAt: input.now }, { expectedStatus: "draft" }); if (!active) conflict("Draft changed concurrently"); const enrollment = await enrollInTransaction(transaction, input); return { ...active, enrollment }; }); },
    enrollNew: enroll,
    async markTreatmentApplied(input: Actor & { assignmentId: string; now: Date }) { admin(input); const updated = await repository.markTreatmentApplied({ assignmentId: input.assignmentId, actorId: input.actorId, at: input.now }); if (updated) return { applied: true }; const all = (await Promise.all((await repository.listExperiments()).map((item) => repository.findAssignments(item.id)))).flat(); if (all.some((assignment) => assignment.id === input.assignmentId && assignment.arm === "control")) conflict("Control assignments cannot receive treatment"); return { applied: false }; },
    async stop(input: Actor & { experimentId: string; now: Date }) { admin(input); const value = await experiment(input.experimentId); if (value.status !== "active") conflict("Only active experiments can stop"); return (await repository.updateExperiment(value.id, { status: "stopped", endedAt: input.now }, { expectedStatus: "active" })) ?? conflict("Experiment changed concurrently"); },
    async complete(input: Actor & { experimentId: string; now: Date }) { admin(input); const value = await experiment(input.experimentId); if (value.status !== "active" && value.status !== "stopped") conflict("Only active or stopped experiments can complete"); return (await repository.updateExperiment(value.id, { status: "completed", endedAt: input.now }, { expectedStatus: value.status })) ?? conflict("Experiment changed concurrently"); },
    async recordFinalDecision(input: Actor & { experimentId: string; decision: "inconclusive" | "rejected" | "approved"; notes: string; now: Date }) { admin(input); const value = await experiment(input.experimentId); if (value.status !== "completed" || value.finalDecision !== null) conflict("Only undecided completed experiments can receive a final decision"); return (await repository.updateExperiment(value.id, { finalDecision: input.decision, finalDecisionById: input.actorId, finalDecisionAt: input.now, finalDecisionNotes: input.notes }, { expectedStatus: "completed", requireNoFinalDecision: true })) ?? conflict("Final decision changed concurrently"); },
    async detail(input: Actor & { experimentId: string; now: Date }) {
      admin(input); const value = await experiment(input.experimentId); const assignments = await repository.findAssignments(value.id); const outcomes = await repository.findOutcomeEvents({ leadIds: assignments.map((assignment) => assignment.leadId), before: value.endedAt ?? input.now });
      const byLead = new Map<string, OutcomeRow[]>(); for (const outcome of outcomes) { const rows = byLead.get(outcome.leadId) ?? []; rows.push(outcome); byLead.set(outcome.leadId, rows); }
      const results = analyzeCommercialExperiment({ assignments: assignments.map((assignment) => ({ ...assignment, outcomes: byLead.get(assignment.leadId) ?? [] })), now: value.endedAt ?? input.now, maturationDays: value.maturationDays, minimumSamplePerArm: value.minimumSamplePerArm, primaryMetric: value.primaryMetric, guardrailTolerancePp: value.guardrailTolerancePp });
      return { ...value, treatmentConfig: value.treatmentConfig, results, assignments: assignments.map((assignment) => ({ id: assignment.id, leadId: assignment.leadId, arm: assignment.arm, enrolledAt: assignment.enrolledAt, isMature: isCommercialExperimentAssignmentMature({ enrolledAt: assignment.enrolledAt, maturationDays: value.maturationDays, now: value.endedAt ?? input.now }), frozenContext: assignment.frozenContext, treatmentAppliedAt: assignment.treatmentAppliedAt, ...(assignment.arm === "treatment" ? { treatmentInstructions: value.treatmentInstructions } : {}) })) };
    },
  };
}
