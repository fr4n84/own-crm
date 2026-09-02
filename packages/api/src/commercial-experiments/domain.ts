export const COMMERCIAL_EXPERIMENT_INTERVENTION_TYPES = [
  "assignment_routing",
  "speed_priority",
  "follow_up_cadence",
  "next_best_action",
] as const;
export type CommercialExperimentInterventionType = (typeof COMMERCIAL_EXPERIMENT_INTERVENTION_TYPES)[number];

export const COMMERCIAL_EXPERIMENT_OUTCOMES = ["contacted", "appointment", "show", "sale"] as const;
export type CommercialExperimentOutcome = (typeof COMMERCIAL_EXPERIMENT_OUTCOMES)[number];

export type CommercialExperimentArm = "control" | "treatment";
export type CommercialExperimentEligibility = {
  profiles?: string[];
  sources?: string[];
  campaigns?: string[];
  types?: string[];
} | null;
export type CommercialExperimentLeadContext = { profile: string | null; source: string | null; campaign: string | null; type: string };
export type CommercialExperimentOutcomeEvent = { kind: CommercialExperimentOutcome; occurredAt: Date };
export type CommercialExperimentOutcomeFlags = Record<CommercialExperimentOutcome, boolean>;

export type CommercialExperimentAssignment = {
  id: string;
  arm: CommercialExperimentArm;
  enrolledAt: Date;
  treatmentAppliedAt: Date | null;
  outcomes: readonly CommercialExperimentOutcomeEvent[];
};

export const COMMERCIAL_EXPERIMENT_CONFIDENCE_INTERVAL_METHOD = "Newcombe hybrid-score 95% interval for treatment minus control, using Wilson score arm limits and root-sum-squares around the observed difference.";

export function stableCommercialExperimentHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function allocateCommercialExperimentArm(input: { experimentId: string; leadId: string; allocationPercent: number }): CommercialExperimentArm {
  if (input.allocationPercent <= 0) return "control";
  if (input.allocationPercent >= 100) return "treatment";
  const allocation = stableCommercialExperimentHash(`${input.experimentId}:${input.leadId}`) / 0x1_0000_0000;
  return allocation < input.allocationPercent / 100 ? "treatment" : "control";
}

function matches(values: readonly string[] | undefined, value: string | null) {
  return !values?.length || (value !== null && values.includes(value));
}

export function isEligibleForCommercialExperiment(input: { eligibility: CommercialExperimentEligibility; lead: CommercialExperimentLeadContext }) {
  const eligibility = input.eligibility;
  return !eligibility
    || (matches(eligibility.profiles, input.lead.profile)
      && matches(eligibility.sources, input.lead.source)
      && matches(eligibility.campaigns, input.lead.campaign)
      && matches(eligibility.types, input.lead.type));
}

export function hasCommercialExperimentConflict(input: { interventionType: CommercialExperimentInterventionType; activeInterventionTypes: readonly CommercialExperimentInterventionType[] }) {
  return input.activeInterventionTypes.includes(input.interventionType);
}

export function deriveCommercialExperimentOutcomes(input: { events: readonly CommercialExperimentOutcomeEvent[]; enrolledAt: Date; cutoff: Date }): CommercialExperimentOutcomeFlags {
  const outcomes: CommercialExperimentOutcomeFlags = { contacted: false, appointment: false, show: false, sale: false };
  for (const event of input.events) {
    if (event.occurredAt > input.enrolledAt && event.occurredAt < input.cutoff) outcomes[event.kind] = true;
  }
  return outcomes;
}

export function isCommercialExperimentAssignmentMature(input: { enrolledAt: Date; maturationDays: number; now: Date }) {
  const maturityAt = new Date(input.enrolledAt.getTime() + input.maturationDays * 86_400_000);
  return input.now >= maturityAt;
}

export function selectMatureCommercialExperimentAssignments(input: { assignments: readonly CommercialExperimentAssignment[]; maturationDays: number; now: Date }) {
  return input.assignments.filter((assignment) => isCommercialExperimentAssignmentMature({ enrolledAt: assignment.enrolledAt, maturationDays: input.maturationDays, now: input.now }));
}

type FunnelMeasure = { count: number; rate: number };
type ArmFunnel = Record<CommercialExperimentOutcome, FunnelMeasure>;
type ArmAnalysis = { sampleSize: number; funnel: ArmFunnel };

function analyzeArm(assignments: readonly CommercialExperimentAssignment[], cutoff: Date): ArmAnalysis {
  const sampleSize = assignments.length;
  const funnel = Object.fromEntries(COMMERCIAL_EXPERIMENT_OUTCOMES.map((outcome) => [outcome, { count: 0, rate: 0 }])) as ArmFunnel;
  for (const assignment of assignments) {
    const outcomes = deriveCommercialExperimentOutcomes({ events: assignment.outcomes, enrolledAt: assignment.enrolledAt, cutoff });
    for (const outcome of COMMERCIAL_EXPERIMENT_OUTCOMES) if (outcomes[outcome]) funnel[outcome].count += 1;
  }
  for (const outcome of COMMERCIAL_EXPERIMENT_OUTCOMES) funnel[outcome].rate = sampleSize === 0 ? 0 : funnel[outcome].count / sampleSize;
  return { sampleSize, funnel };
}

function wilsonScoreInterval95(rate: number, sampleSize: number) {
  if (sampleSize === 0) return null;
  const z = 1.959963984540054;
  const zSquared = z ** 2;
  const denominator = 1 + zSquared / sampleSize;
  const center = (rate + zSquared / (2 * sampleSize)) / denominator;
  const halfWidth = (z * Math.sqrt((rate * (1 - rate)) / sampleSize + zSquared / (4 * sampleSize ** 2))) / denominator;
  return { lower: Math.max(0, center - halfWidth), upper: Math.min(1, center + halfWidth) };
}

function calculateConfidenceInterval95(controlRate: number, controlN: number, treatmentRate: number, treatmentN: number) {
  if (controlN === 0 || treatmentN === 0) return { lowerPp: null, upperPp: null, method: COMMERCIAL_EXPERIMENT_CONFIDENCE_INTERVAL_METHOD };
  const control = wilsonScoreInterval95(controlRate, controlN);
  const treatment = wilsonScoreInterval95(treatmentRate, treatmentN);
  if (!control || !treatment) return { lowerPp: null, upperPp: null, method: COMMERCIAL_EXPERIMENT_CONFIDENCE_INTERVAL_METHOD };
  const difference = treatmentRate - controlRate;
  return {
    lowerPp: Math.max(-100, (difference - Math.sqrt((treatmentRate - treatment.lower) ** 2 + (control.upper - controlRate) ** 2)) * 100),
    upperPp: Math.min(100, (difference + Math.sqrt((treatment.upper - treatmentRate) ** 2 + (controlRate - control.lower) ** 2)) * 100),
    method: COMMERCIAL_EXPERIMENT_CONFIDENCE_INTERVAL_METHOD,
  };
}

export function analyzeCommercialExperiment(input: {
  assignments: readonly CommercialExperimentAssignment[];
  now: Date;
  maturationDays: number;
  minimumSamplePerArm: number;
  primaryMetric: CommercialExperimentOutcome;
  guardrailTolerancePp: number;
}) {
  const matured = selectMatureCommercialExperimentAssignments(input);
  const controlAssignments = matured.filter((assignment) => assignment.arm === "control");
  const treatmentAssignments = matured.filter((assignment) => assignment.arm === "treatment");
  const arms = { control: analyzeArm(controlAssignments, input.now), treatment: analyzeArm(treatmentAssignments, input.now) };
  const controlRate = arms.control.funnel[input.primaryMetric].rate;
  const treatmentRate = arms.treatment.funnel[input.primaryMetric].rate;
  const absolutePpUplift = (treatmentRate - controlRate) * 100;
  const confidenceInterval95 = calculateConfidenceInterval95(controlRate, arms.control.sampleSize, treatmentRate, arms.treatment.sampleSize);
  const guardrail = { tolerancePp: input.guardrailTolerancePp, isHarm: absolutePpUplift < -input.guardrailTolerancePp };
  const treatmentApplied = treatmentAssignments.filter((assignment) => assignment.treatmentAppliedAt !== null).length;
  const compliance = { applied: treatmentApplied, eligible: treatmentAssignments.length, rate: treatmentAssignments.length === 0 ? 0 : treatmentApplied / treatmentAssignments.length };
  const hasMinimumSample = arms.control.sampleSize >= input.minimumSamplePerArm && arms.treatment.sampleSize >= input.minimumSamplePerArm;
  const state = !hasMinimumSample
    ? "insufficient" as const
    : guardrail.isHarm || (confidenceInterval95.upperPp !== null && confidenceInterval95.upperPp < 0)
      ? "candidate_harm" as const
      : confidenceInterval95.lowerPp !== null && confidenceInterval95.lowerPp > 0
        ? "candidate_winner" as const
        : "inconclusive" as const;

  return {
    maturedAssignments: matured.length,
    arms,
    primary: {
      metric: input.primaryMetric,
      controlRate,
      treatmentRate,
      absolutePpUplift,
      relativeUplift: controlRate === 0 ? null : (treatmentRate - controlRate) / controlRate,
      confidenceInterval95,
    },
    guardrail,
    compliance,
    state,
  };
}
