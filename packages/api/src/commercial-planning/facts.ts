import { getAuthoritativeConversionMilestones } from "../dashboard/conversion-funnel";
import { madridCalendarDayStart, type PlanningFinancialEvent, type PlanningObservation, type PlanningSpendPeriod } from "./domain";

export type StoredPlanningSpendPeriod = Omit<PlanningSpendPeriod, "periodStart" | "periodEndExclusive"> & {
  periodStart: Date;
  periodEnd: Date;
};

function storedCalendarDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextCalendarDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) throw new RangeError("Invalid stored campaign spend day");
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function normalizePlanningSpendPeriods(periods: readonly StoredPlanningSpendPeriod[]): PlanningSpendPeriod[] {
  return periods.map((period) => {
    const startDay = storedCalendarDayKey(period.periodStart);
    const inclusiveEndDay = storedCalendarDayKey(period.periodEnd);
    if (startDay > inclusiveEndDay) throw new RangeError("Campaign spend period ends before it starts");
    return {
      id: period.id,
      periodStart: madridCalendarDayStart(startDay),
      periodEndExclusive: madridCalendarDayStart(nextCalendarDayKey(inclusiveEndDay)),
      spendCents: period.spendCents,
      currency: period.currency,
    };
  });
}

export type PlanningActivity = {
  id: string;
  leadId: string;
  kind: string;
  occurredAt: Date;
  description: string | null;
  metadata: Record<string, unknown>;
};

export function buildPlanningObservations(input: {
  leads: readonly { id: string; createdAt: Date }[];
  activities: readonly PlanningActivity[];
  financial: readonly (PlanningFinancialEvent & { leadId: string })[];
  cutoff: Date;
}) {
  const activities = [...input.activities]
    .filter((event) => event.occurredAt < input.cutoff)
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id));
  const activitiesByLead = Map.groupBy(activities, (event) => event.leadId);
  const financialByLead = Map.groupBy(input.financial.filter((event) => event.occurredAt < input.cutoff), (event) => event.leadId);
  const uniqueLeads = new Map(input.leads.filter((lead) => lead.createdAt < input.cutoff).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)).map((lead) => [lead.id, lead]));
  const result: PlanningObservation[] = [];
  for (const lead of uniqueLeads.values()) {
    const leadActivities = activitiesByLead.get(lead.id) ?? [];
    const assignment = leadActivities.find((event) => event.kind === "caller_assigned" || event.kind === "closer_assigned");
    const assignedAt = assignment?.occurredAt ?? lead.createdAt;
    const milestones = getAuthoritativeConversionMilestones(leadActivities.filter((event) => event.occurredAt >= assignedAt));
    const appointmentAt = milestones.filter((item) => item.kind === "appointment").sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())[0]?.occurredAt ?? null;
    const soldAt = milestones.filter((item) => item.kind === "sale").sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())[0]?.occurredAt ?? null;
    const financialEvents = [...new Map((financialByLead.get(lead.id) ?? []).map((event) => [event.id, event])).values()]
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id))
      .map(({ leadId: _leadId, ...event }) => event);
    result.push({ leadId: lead.id, assignedAt, appointmentAt, soldAt, financialEvents });
  }
  return result;
}
