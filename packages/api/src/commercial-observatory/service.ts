import { db, inArray } from "@crm-fran/db";
import { user } from "@crm-fran/db/schema/auth";

import { loadCommercialEvidenceData } from "../commercial-evidence/service";
import { acquisitionAt, buildAsOfCases, questionsAt, type CohortActivity } from "../commercial-evidence/cohort";
import { parseConfirmedFacts } from "../commercial-evidence/facts";
import type { EvidenceCase } from "../commercial-evidence/domain";
import { buildCommercialObservatory, normalizeMadridRange, type ObservatoryFinancialEvent, type ObservatoryObservation } from "./domain";

export function buildObservatoryObservations(input: {
  cases: readonly EvidenceCase[];
  activities: readonly CohortActivity[];
  financial: readonly (ObservatoryFinancialEvent & { leadId: string })[];
  asOf: Date;
}) {
  const byLead = Map.groupBy(input.cases, (item) => item.leadId);
  const activitiesByLead = Map.groupBy(input.activities, (item) => item.leadId);
  const financialByLead = Map.groupBy(input.financial, (item) => item.leadId);
  const observations: ObservatoryObservation[] = [];

  for (const grouped of byLead.values()) {
    const ordered = [...grouped].sort((left, right) => left.assignmentAt.getTime() - right.assignmentAt.getTime() || left.epochId.localeCompare(right.epochId));
    const first = ordered[0];
    if (!first) continue;
    const soldAt = ordered.flatMap((item) => item.saleTimestamps ?? []).filter((date) => date < input.asOf).sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
    const activities = activitiesByLead.get(first.leadId) ?? [];
    const financialEvents = [...new Map((financialByLead.get(first.leadId) ?? []).map((event) => [event.id, event])).values()]
      .filter((event) => event.occurredAt < input.asOf)
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id));
    const acquisition = acquisitionAt(activities, first.assignmentAt, true);
    const facts = parseConfirmedFacts(questionsAt(activities, first.assignmentAt, true));
    observations.push({ leadId: first.leadId, assignedAt: first.assignmentAt, soldAt, source: acquisition.source, campaign: acquisition.campaign, callerId: first.callerId, closerId: first.closerId, profile: facts.primaryProfile.kind === "value" ? facts.primaryProfile.value : null, financialEvents });
  }
  return observations;
}

export async function getCommercialObservatory(input: { from: string; to: string; currency?: string }, now = new Date()) {
  const range = normalizeMadridRange({ fromDay: input.from, toDay: input.to, now });
  const { leadRows, activityRows, financialRows } = await loadCommercialEvidenceData(range.to);
  const closedActivities = activityRows.filter((event) => event.occurredAt < range.to);
  const closedFinancial = financialRows.filter((event) => event.occurredAt < range.to);
  const closedAsOf = new Date(range.to.getTime() - 1);
  const cases = buildAsOfCases({ leads: leadRows, activities: closedActivities, financial: closedFinancial, asOf: closedAsOf });
  const rawObservations = buildObservatoryObservations({ cases, activities: closedActivities, financial: closedFinancial, asOf: range.to });
  const ownerIds = [...new Set(rawObservations.flatMap((row) => [row.callerId, row.closerId]).filter((id): id is string => id !== null))];
  const owners = ownerIds.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ownerIds)) : [];
  const ownerNames = new Map(owners.map((owner) => [owner.id, owner.name]));
  const observations = rawObservations.map((row) => ({ ...row, callerLabel: row.callerId ? ownerNames.get(row.callerId) ?? "Sin identificar" : null, closerLabel: row.closerId ? ownerNames.get(row.closerId) ?? "Sin identificar" : null }));
  return buildCommercialObservatory({ from: range.from, to: range.to, currency: input.currency, observations, asOf: range.to });
}
