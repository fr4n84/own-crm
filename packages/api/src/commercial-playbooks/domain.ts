import { createHash } from "node:crypto";

import type {
  CommercialLibraryEvidence,
  CommercialLibraryTargeting,
  CommercialPlaybookEvidenceSnapshot,
} from "@crm-fran/db/schema/index";

import { FEEDBACK_PROFILES, MOTIVATION_ANGLES, OBJECTION_TYPES } from "../call-feedback";
import { analyzeCommercialExperiment, type CommercialExperimentOutcome } from "../commercial-experiments/domain";

export const COMMERCIAL_PLAYBOOK_POLICY_VERSION = "commercial-playbooks-v1";
export const COMMERCIAL_PLAYBOOK_OBSERVATION_WINDOW_DAYS = 180;
export const COMMERCIAL_PLAYBOOK_MATURITY_DAYS = 30;
export const COMMERCIAL_PLAYBOOK_MINIMUM_MATURE_SAMPLE = 30;

type FeedbackEvent = { id: string; leadId: string; assignmentEpoch?: string | null; assignmentEndedAt?: Date | null; occurredAt: Date; metadata: Record<string, unknown> };
type OutcomeEvent = { id: string; leadId: string; kind: CommercialExperimentOutcome; occurredAt: Date };
type LibraryVersion = {
  id: string;
  lineageKey: string;
  version: number;
  status: "draft" | "published" | "archived";
  type: string;
  title: string;
  content: string;
  targeting: CommercialLibraryTargeting;
  evidence: CommercialLibraryEvidence;
};
type ExperimentAssignment = { id: string; leadId: string; arm: "control" | "treatment"; enrolledAt: Date; treatmentAppliedAt: Date | null };
type ExperimentFact = {
  id: string;
  status: string;
  finalDecision: string | null;
  finalDecisionById: string | null;
  finalDecisionAt: Date | null;
  primaryMetric: CommercialExperimentOutcome;
  maturationDays: number;
  minimumSamplePerArm: number;
  guardrailTolerancePp: number;
  endedAt: Date | null;
  treatmentConfig: Record<string, unknown>;
  assignments: ExperimentAssignment[];
  outcomes: OutcomeEvent[];
};

export type PlaybookEvidenceFacts = {
  asOf: Date;
  feedbackEvents: FeedbackEvent[];
  outcomeEvents: OutcomeEvent[];
  libraryVersions: LibraryVersion[];
  experiments: ExperimentFact[];
};

export type CommercialPlaybookCandidate = {
  candidateKey: string;
  proposalLineageKey: string;
  source: "observational_gap" | "approved_experiment";
  availability: "ready" | "insufficient";
  libraryLineageKey: string;
  baseLibraryVersionId: string | null;
  experimentSourceId: string | null;
  title: string;
  content: string;
  changeSummary: string;
  targeting: CommercialLibraryTargeting;
  evidenceSnapshot: CommercialPlaybookEvidenceSnapshot;
};

const profileLabels: ReadonlyMap<string, string> = new Map(FEEDBACK_PROFILES.map((item) => [item.value, item.label]));
const objectionLabels: ReadonlyMap<string, string> = new Map(OBJECTION_TYPES.map((item) => [item.value, item.label]));
const motivationLabels: ReadonlyMap<string, string> = new Map(MOTIVATION_ANGLES.map((item) => [item.value, item.label]));
const profileValues: ReadonlySet<string> = new Set(profileLabels.keys());
const objectionValues: ReadonlySet<string> = new Set(objectionLabels.keys());
const motivationValues: ReadonlySet<string> = new Set(motivationLabels.keys());

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function candidateKey(identity: unknown) {
  return `playbook:${sha256(identity)}`;
}

function questions(metadata: Record<string, unknown>) {
  return Array.isArray(metadata.questions) ? metadata.questions.filter((value): value is { questionKey: string; answer: string } => (
    typeof value === "object" && value !== null && "questionKey" in value && typeof value.questionKey === "string" && "answer" in value && typeof value.answer === "string"
  )) : [];
}

function scalarTaxonomy(metadata: Record<string, unknown>, key: string, allowed: ReadonlySet<string>) {
  const answer = questions(metadata).find((item) => item.questionKey === key)?.answer;
  return answer && allowed.has(answer) ? answer : null;
}

function arrayTaxonomy(metadata: Record<string, unknown>, key: string, allowed: ReadonlySet<string>) {
  const answer = questions(metadata).find((item) => item.questionKey === key)?.answer;
  if (!answer) return [];
  try {
    const parsed: unknown = JSON.parse(answer);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && allowed.has(value)) : [];
  } catch {
    return [];
  }
}

function latestPublished(rows: readonly LibraryVersion[]) {
  const latest = new Map<string, LibraryVersion>();
  for (const row of [...rows].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id))) {
    if (!latest.has(row.lineageKey)) latest.set(row.lineageKey, row);
  }
  return [...latest.values()].filter((row) => row.status === "published");
}

function signalIsCovered(row: LibraryVersion, signal: { kind: "objection" | "motivation"; value: string; profile: string | null }) {
  const profileMatches = row.targeting.profile == null || row.targeting.profile === signal.profile;
  const taxonomyMatches = signal.kind === "objection"
    ? row.targeting.objections?.includes(signal.value)
    : row.targeting.motivations?.includes(signal.value);
  return profileMatches && taxonomyMatches === true;
}

function observationalCandidates(facts: PlaybookEvidenceFacts) {
  const cutoff = new Date(facts.asOf.getTime() - COMMERCIAL_PLAYBOOK_MATURITY_DAYS * 86_400_000);
  const windowStart = new Date(facts.asOf.getTime() - COMMERCIAL_PLAYBOOK_OBSERVATION_WINDOW_DAYS * 86_400_000);
  const groups = new Map<string, { kind: "objection" | "motivation"; value: string; profile: string | null; events: FeedbackEvent[] }>();
  for (const event of facts.feedbackEvents) {
    if (event.occurredAt < windowStart || event.occurredAt > cutoff || event.occurredAt > facts.asOf) continue;
    const profile = scalarTaxonomy(event.metadata, "primaryProfile", profileValues)
      ?? scalarTaxonomy(event.metadata, "profile", profileValues)
      ?? scalarTaxonomy(event.metadata, "subProfile", profileValues);
    const signals = [
      ...arrayTaxonomy(event.metadata, "objectionTypes", objectionValues).map((value) => ({ kind: "objection" as const, value })),
      ...arrayTaxonomy(event.metadata, "motivationAngles", motivationValues).map((value) => ({ kind: "motivation" as const, value })),
    ];
    for (const signal of signals) {
      const key = JSON.stringify([signal.kind, signal.value, profile]);
      const group = groups.get(key) ?? { ...signal, profile, events: [] };
      group.events.push(event);
      groups.set(key, group);
    }
  }

  const published = latestPublished(facts.libraryVersions);
  return [...groups.values()].flatMap((group): CommercialPlaybookCandidate[] => {
    if (published.some((row) => signalIsCovered(row, group))) return [];
    const feedbackUnitKey = (event: FeedbackEvent) => `${event.leadId}\u0000${event.assignmentEpoch ?? "unverified"}`;
    const feedbackByUnit = new Map<string, FeedbackEvent>();
    for (const event of [...group.events].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id))) {
      const key = feedbackUnitKey(event);
      if (!feedbackByUnit.has(key)) feedbackByUnit.set(key, event);
    }
    const representativeFeedback = [...feedbackByUnit.values()];
    const feedbackIds = representativeFeedback.map((event) => event.id).sort();
    const saleOutcomes = facts.outcomeEvents.filter((outcome) => (
      outcome.kind === "sale"
      && outcome.occurredAt <= facts.asOf
      && representativeFeedback.some((event) => event.leadId === outcome.leadId
        && outcome.occurredAt >= event.occurredAt
        && (!event.assignmentEndedAt || outcome.occurredAt < event.assignmentEndedAt)
        && outcome.occurredAt <= new Date(event.occurredAt.getTime() + COMMERCIAL_PLAYBOOK_MATURITY_DAYS * 86_400_000))
    ));
    const outcomeIds = [...new Set(saleOutcomes.map((outcome) => outcome.id))].sort();
    const sales = new Set(representativeFeedback.flatMap((event) => saleOutcomes.some((outcome) => (
      outcome.leadId === event.leadId
      && outcome.occurredAt >= event.occurredAt
      && (!event.assignmentEndedAt || outcome.occurredAt < event.assignmentEndedAt)
      && outcome.occurredAt <= new Date(event.occurredAt.getTime() + COMMERCIAL_PLAYBOOK_MATURITY_DAYS * 86_400_000)
    )) ? [feedbackUnitKey(event)] : []));
    const sampleSize = feedbackIds.length;
    const signalLabel = (group.kind === "objection" ? objectionLabels : motivationLabels).get(group.value) ?? group.value;
    const profileLabel = group.profile ? profileLabels.get(group.profile) ?? group.profile : "perfil no informado";
    const targeting: CommercialLibraryTargeting = {
      profile: group.profile,
      ...(group.kind === "objection" ? { objections: [group.value] } : { motivations: [group.value] }),
    };
    const denominators = { matureFeedbacks: sampleSize };
    const rates = { saleRate: sampleSize === 0 ? 0 : sales.size / sampleSize };
    const confidence = sampleSize < COMMERCIAL_PLAYBOOK_MINIMUM_MATURE_SAMPLE ? "insufficient" as const : "observational" as const;
    const evidenceIds = [
      ...feedbackIds.map((id) => `feedback:${id}`),
      ...outcomeIds.map((id) => `outcome:${id}`),
    ].sort();
    const limitations = ["La asociación es observacional y no demuestra causalidad.", "No se utilizan transcripciones ni respuestas libres.", "Cuando no existe una asignación previa verificable, los feedbacks se deduplican conservadoramente por lead."];
    const canonicalEvidence = {
      policyVersion: COMMERCIAL_PLAYBOOK_POLICY_VERSION,
      source: "observational_gap" as const,
      maturityDays: COMMERCIAL_PLAYBOOK_MATURITY_DAYS,
      windowDays: COMMERCIAL_PLAYBOOK_OBSERVATION_WINDOW_DAYS,
      signal: { kind: group.kind, value: group.value, profile: group.profile },
      targeting,
      feedbackIds,
      outcomeIds,
      evidenceIds,
      sampleSize,
      denominators,
      rates,
      confidence,
      confidenceInterval95: null,
      evidenceLabel: "observational" as const,
      limitations,
    };
    const fingerprint = sha256(canonicalEvidence);
    const evidenceSnapshot: CommercialPlaybookEvidenceSnapshot = {
      asOf: facts.asOf.toISOString(), cutoff: cutoff.toISOString(), cohortFingerprint: fingerprint,
      policyVersion: COMMERCIAL_PLAYBOOK_POLICY_VERSION, source: "observational_gap",
      maturityDays: COMMERCIAL_PLAYBOOK_MATURITY_DAYS, windowDays: COMMERCIAL_PLAYBOOK_OBSERVATION_WINDOW_DAYS,
      sampleSize, denominators, rates,
      confidence,
      confidenceInterval95: null, evidenceIds, evidenceLabel: "observational",
      limitations,
    };
    const libraryLineageKey = `learned:${sha256([group.kind, group.value, group.profile]).slice(0, 24)}`;
    const sourceIdentity = { source: "observational_gap", fingerprint, libraryLineageKey };
    return [{
      candidateKey: candidateKey(sourceIdentity), source: "observational_gap",
      proposalLineageKey: `proposal:${sha256({ source: "observational_gap", libraryLineageKey })}`,
      availability: sampleSize < COMMERCIAL_PLAYBOOK_MINIMUM_MATURE_SAMPLE ? "insufficient" : "ready",
      libraryLineageKey,
      baseLibraryVersionId: null, experimentSourceId: null,
      title: `Cobertura de ${signalLabel}`,
      content: `Borrador pendiente de edición humana para ${signalLabel} en ${profileLabel}.`,
      changeSummary: `Cubrir la señal confirmada ${signalLabel} para ${profileLabel}.`,
      targeting, evidenceSnapshot,
    }];
  }).sort((a, b) => a.candidateKey.localeCompare(b.candidateKey));
}

function experimentalCandidates(facts: PlaybookEvidenceFacts) {
  const libraryById = new Map(facts.libraryVersions.map((row) => [row.id, row]));
  const currentLibraryByLineage = new Map<string, LibraryVersion>();
  for (const row of [...facts.libraryVersions].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id))) {
    if (!currentLibraryByLineage.has(row.lineageKey)) currentLibraryByLineage.set(row.lineageKey, row);
  }
  const candidates: CommercialPlaybookCandidate[] = [];
  let hasUnboundExperiment = false;
  for (const experiment of facts.experiments) {
    if (
      experiment.status !== "completed"
      || experiment.finalDecision !== "approved"
      || !experiment.finalDecisionById
      || !experiment.finalDecisionAt
      || !experiment.endedAt
      || experiment.endedAt > facts.asOf
      || experiment.finalDecisionAt < experiment.endedAt
      || experiment.finalDecisionAt > facts.asOf
    ) continue;
    const libraryVersionId = typeof experiment.treatmentConfig.libraryVersionId === "string" ? experiment.treatmentConfig.libraryVersionId : null;
    const base = libraryVersionId ? libraryById.get(libraryVersionId) : undefined;
    if (!libraryVersionId || !base) { hasUnboundExperiment = true; continue; }
    if (base.status !== "published" || base.type !== "playbook") continue;
    if (currentLibraryByLineage.get(base.lineageKey)?.id !== base.id) continue;
    const eligibleAssignments = experiment.assignments.filter((assignment) => assignment.enrolledAt <= experiment.endedAt!);
    const normalizedAssignments = eligibleAssignments.map((assignment) => {
      const maturityAt = new Date(assignment.enrolledAt.getTime() + experiment.maturationDays * 86_400_000);
      return {
        ...assignment,
        treatmentAppliedAt: assignment.treatmentAppliedAt
          && assignment.treatmentAppliedAt >= assignment.enrolledAt
          && assignment.treatmentAppliedAt < maturityAt
          && assignment.treatmentAppliedAt <= experiment.endedAt!
          ? assignment.treatmentAppliedAt
          : null,
      };
    });
    const maturedAssignments = normalizedAssignments.filter((assignment) => (
      assignment.enrolledAt.getTime() + experiment.maturationDays * 86_400_000 <= experiment.endedAt!.getTime()
    ));
    const outcomesByLead = new Map<string, OutcomeEvent[]>();
    for (const outcome of experiment.outcomes.filter((row) => row.occurredAt <= experiment.endedAt!)) {
      const rows = outcomesByLead.get(outcome.leadId) ?? [];
      rows.push(outcome); outcomesByLead.set(outcome.leadId, rows);
    }
    const analyzedAssignments = normalizedAssignments.map((assignment) => {
        const maturityAt = new Date(assignment.enrolledAt.getTime() + experiment.maturationDays * 86_400_000);
        const exposureAt = assignment.arm === "treatment" ? assignment.treatmentAppliedAt : assignment.enrolledAt;
        const outcomes = exposureAt
          ? (outcomesByLead.get(assignment.leadId) ?? []).filter((outcome) => outcome.occurredAt > exposureAt && outcome.occurredAt < maturityAt)
          : [];
        return { ...assignment, outcomes };
      });
    const analysis = analyzeCommercialExperiment({
      assignments: analyzedAssignments,
      now: experiment.endedAt, maturationDays: experiment.maturationDays,
      minimumSamplePerArm: Math.max(COMMERCIAL_PLAYBOOK_MINIMUM_MATURE_SAMPLE, experiment.minimumSamplePerArm),
      primaryMetric: experiment.primaryMetric, guardrailTolerancePp: experiment.guardrailTolerancePp,
    });
    const treatmentFullyApplied = analysis.compliance.eligible > 0 && analysis.compliance.rate === 1;
    if (analysis.state !== "candidate_winner" || analysis.guardrail.isHarm || !treatmentFullyApplied || analysis.primary.confidenceInterval95.lowerPp === null || analysis.primary.confidenceInterval95.lowerPp <= 0) continue;
    const maturedAssignmentIds = new Set(maturedAssignments.map((assignment) => assignment.id));
    const assignmentEvidence = analyzedAssignments
      .filter((assignment) => maturedAssignmentIds.has(assignment.id))
      .map((assignment) => ({
        id: assignment.id,
        arm: assignment.arm,
        enrolledAt: assignment.enrolledAt.toISOString(),
        treatmentAppliedAt: assignment.treatmentAppliedAt?.toISOString() ?? null,
        outcomeIds: assignment.outcomes.map((outcome) => outcome.id).sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const evidenceIds = assignmentEvidence.flatMap((assignment) => [
      `assignment:${assignment.id}`,
      ...assignment.outcomeIds.map((id) => `outcome:${id}`),
    ]).sort();
    const denominators = { control: analysis.arms.control.sampleSize, treatment: analysis.arms.treatment.sampleSize };
    const rates = { control: analysis.primary.controlRate, treatment: analysis.primary.treatmentRate, absolutePpUplift: analysis.primary.absolutePpUplift };
    const confidenceInterval95 = analysis.primary.confidenceInterval95;
    const windowDays = Math.ceil((experiment.endedAt.getTime() - Math.min(...maturedAssignments.map((row) => row.enrolledAt.getTime()))) / 86_400_000);
    const limitations = ["La evidencia solo respalda la versión de biblioteca vinculada explícitamente al tratamiento."];
    const fingerprint = sha256({
      policyVersion: COMMERCIAL_PLAYBOOK_POLICY_VERSION,
      source: "approved_experiment",
      experimentId: experiment.id,
      libraryVersionId,
      libraryLineageKey: base.lineageKey,
      primaryMetric: experiment.primaryMetric,
      maturationDays: experiment.maturationDays,
      minimumSamplePerArm: experiment.minimumSamplePerArm,
      effectiveMinimumSamplePerArm: Math.max(COMMERCIAL_PLAYBOOK_MINIMUM_MATURE_SAMPLE, experiment.minimumSamplePerArm),
      guardrailTolerancePp: experiment.guardrailTolerancePp,
      endedAt: experiment.endedAt.toISOString(),
      cutoff: experiment.endedAt.toISOString(),
      finalDecisionAt: experiment.finalDecisionAt.toISOString(),
      finalDecision: experiment.finalDecision,
      assignments: assignmentEvidence,
      evidenceIds,
      windowDays,
      sampleSize: analysis.maturedAssignments,
      denominators,
      rates,
      confidence: "experiment_supported",
      confidenceInterval95,
      treatmentCompliance: analysis.compliance,
      guardrail: analysis.guardrail,
      evidenceLabel: "experimental",
      limitations,
    });
    const evidenceSnapshot: CommercialPlaybookEvidenceSnapshot = {
      asOf: facts.asOf.toISOString(), cutoff: experiment.endedAt.toISOString(), cohortFingerprint: fingerprint,
      policyVersion: COMMERCIAL_PLAYBOOK_POLICY_VERSION, source: "approved_experiment", maturityDays: experiment.maturationDays,
      windowDays,
      sampleSize: analysis.maturedAssignments,
      denominators,
      rates,
      confidence: "experiment_supported", confidenceInterval95,
      evidenceIds, evidenceLabel: "experimental",
      limitations,
    };
    candidates.push({
      candidateKey: candidateKey({ source: "approved_experiment", fingerprint, baseLibraryVersionId: base.id, libraryLineageKey: base.lineageKey }),
      proposalLineageKey: `proposal:${sha256({ source: "approved_experiment", experimentId: experiment.id, libraryLineageKey: base.lineageKey })}`,
      source: "approved_experiment", availability: "ready", libraryLineageKey: base.lineageKey,
      baseLibraryVersionId: base.id, experimentSourceId: experiment.id,
      title: "Revisión respaldada por experimento aprobado",
      content: "Borrador pendiente de edición humana basado en una versión vinculada al tratamiento.",
      changeSummary: "Incorporar únicamente el aprendizaje validado por el experimento aprobado.",
      targeting: base.targeting, evidenceSnapshot,
    });
  }
  return { candidates: candidates.sort((a, b) => a.candidateKey.localeCompare(b.candidateKey)), hasUnboundExperiment };
}

export function buildCommercialPlaybookCandidates(facts: PlaybookEvidenceFacts) {
  const observational = observationalCandidates(facts);
  const experimental = experimentalCandidates(facts);
  return {
    candidates: [...observational, ...experimental.candidates].sort((a, b) => a.candidateKey.localeCompare(b.candidateKey)),
    limitations: [
      "Las señales observacionales nunca prueban causalidad.",
      ...(experimental.hasUnboundExperiment ? ["Los experimentos sin libraryVersionId explícito no pueden atribuir aprendizaje a un playbook."] : []),
    ],
    policyVersion: COMMERCIAL_PLAYBOOK_POLICY_VERSION,
    asOf: facts.asOf.toISOString(),
  };
}
