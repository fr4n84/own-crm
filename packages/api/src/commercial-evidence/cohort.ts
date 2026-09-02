import { getAuthoritativeConversionMilestones } from "../dashboard/conversion-funnel";
import type { FinancialTruthEvent } from "../profitability/financial-truth";
import type { Acquisition, EvidenceCase } from "./domain";
import { parseConfirmedFacts } from "./facts";

export type CohortActivity = {
  id: string;
  leadId: string;
  kind: string;
  occurredAt: Date;
  description: string | null;
  metadata: Record<string, unknown>;
};

const priority = (kind: string) =>
  kind === "lead_created" ? 0 : kind === "lead_attribution_updated" ? 1 : kind.endsWith("_assigned") ? 2 : kind.endsWith("_feedback") ? 3 : 4;
const emptyAcquisition = (): Acquisition => ({ source: null, campaign: null, ad: null, creative: null, acquisitionAngle: null });
const readUserId = (event: CohortActivity) => typeof event.metadata.userId === "string" ? event.metadata.userId : null;
const isAssignment = (event: CohortActivity) => event.kind === "caller_assigned" || event.kind === "closer_assigned";

export function sortCohortActivities(events: readonly CohortActivity[]) {
  return [...events].sort((left, right) =>
    left.occurredAt.getTime() - right.occurredAt.getTime() ||
    priority(left.kind) - priority(right.kind) ||
    left.id.localeCompare(right.id));
}

function updateAcquisition(metadata: Record<string, unknown>, prior: Acquisition) {
  const source = metadata.after && typeof metadata.after === "object" ? metadata.after as Record<string, unknown> : metadata;
  const read = (key: keyof Acquisition) => typeof source[key] === "string" ? source[key] as string : source[key] === null ? null : prior[key];
  return { source: read("source"), campaign: read("campaign"), ad: read("ad"), creative: read("creative"), acquisitionAngle: read("acquisitionAngle") };
}

export function questionsAt(events: readonly CohortActivity[], cutoff: Date, inclusive: boolean) {
  let questions: { questionKey: string; answer: string }[] = [];
  for (const event of sortCohortActivities(events)) {
    const usable = inclusive ? event.occurredAt <= cutoff : event.occurredAt < cutoff;
    if (!usable || event.kind !== "caller_feedback" || !Array.isArray(event.metadata.questions)) continue;
    questions = event.metadata.questions.filter((question): question is { questionKey: string; answer: string } =>
      typeof question === "object" && question !== null && "questionKey" in question && "answer" in question &&
      typeof question.questionKey === "string" && typeof question.answer === "string");
  }
  return questions;
}

export function acquisitionAt(events: readonly CohortActivity[], cutoff: Date, inclusive: boolean) {
  let result = emptyAcquisition();
  for (const event of sortCohortActivities(events)) {
    const usable = inclusive ? event.occurredAt <= cutoff : event.occurredAt < cutoff;
    if (usable && (event.kind === "lead_created" || event.kind === "lead_attribution_updated")) result = updateAcquisition(event.metadata, result);
  }
  return result;
}

export function buildAsOfCases(input: {
  leads: readonly { id: string; type?: string; createdAt: Date; callerId?: string | null; closerId?: string | null }[];
  activities: readonly CohortActivity[];
  financial: readonly (FinancialTruthEvent & { leadId: string })[];
  asOf: Date;
}) {
  const byLead = new Map<string, CohortActivity[]>();
  for (const event of sortCohortActivities(input.activities.filter((item) => item.occurredAt <= input.asOf))) {
    const rows = byLead.get(event.leadId) ?? [];
    rows.push(event);
    byLead.set(event.leadId, rows);
  }

  return input.leads.filter((lead) => lead.createdAt <= input.asOf).flatMap((lead): EvidenceCase[] => {
    const events = byLead.get(lead.id) ?? [];
    const assignments = events.filter(isAssignment);
    const groupedAssignments = [...Map.groupBy(assignments, (event) => event.occurredAt.getTime())]
      .sort(([left], [right]) => left - right)
      .map(([, grouped]) => ({ id: grouped.map((event) => event.id).sort().join("+"), occurredAt: grouped[0]!.occurredAt, assignments: grouped }));
    const boundaries = groupedAssignments.length ? groupedAssignments : [{ id: "created", occurredAt: lead.createdAt, assignments: [] }];
    let callerId: string | null = assignments.some((event) => event.kind === "caller_assigned") ? null : lead.callerId ?? null;
    let closerId: string | null = assignments.some((event) => event.kind === "closer_assigned") ? null : lead.closerId ?? null;
    return boundaries.map((boundary, index): EvidenceCase => {
      for (const assignment of boundary.assignments) {
        if (assignment.kind === "caller_assigned") callerId = readUserId(assignment);
        if (assignment.kind === "closer_assigned") closerId = readUserId(assignment);
      }
      const assignmentEndedAt = boundaries[index + 1]?.occurredAt ?? null;
      const epochEvents = events.filter((event) => event.occurredAt >= boundary.occurredAt && (!assignmentEndedAt || event.occurredAt < assignmentEndedAt));
      const saleTimestamps = epochEvents.flatMap((event) =>
        getAuthoritativeConversionMilestones([event]).filter((milestone) => milestone.kind === "sale").map((milestone) => milestone.occurredAt))
        .sort((a, b) => a.getTime() - b.getTime());
      const soldAt = saleTimestamps[0] ?? null;
      const featureCutoffAt = soldAt ?? assignmentEndedAt ?? input.asOf;
      const inclusive = soldAt === null && assignmentEndedAt === null;
      return {
        epochId: `${lead.id}:${boundary.id}`,
        leadId: lead.id,
        type: lead.type,
        assignmentAt: boundary.occurredAt,
        assignmentEndedAt,
        featureCutoffAt,
        callerId,
        closerId,
        facts: parseConfirmedFacts(questionsAt(events, featureCutoffAt, inclusive)),
        acquisition: acquisitionAt(events, featureCutoffAt, inclusive),
        sold: soldAt !== null,
        soldAt,
        saleTimestamps,
        financialEvents: soldAt ? input.financial.filter((event) => event.leadId === lead.id && event.occurredAt <= input.asOf) : [],
      };
    });
  });
}
