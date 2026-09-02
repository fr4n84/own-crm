import { and, asc, db, inArray } from "@crm-fran/db";
import { LEAD_ACTIVITY_KIND, leadActivityEvents } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";

import { isAuthoritativeCallerContact, isAuthoritativeCallerFeedback } from "../../lead-feedback-events";

type RiskLead = {
  id: string;
  name: string;
  callerId: string | null;
  caller: { id: string; name: string } | null;
};

type RiskEvent = {
  id: string;
  leadId: string;
  actorId: string | null;
  actorRole?: string | null;
  kind: string;
  description: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

export type LeadRiskPriority = "critical" | "high" | "medium" | "low";

const PRIORITY_RANK: Record<LeadRiskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function differenceInMinutes(later: Date, earlier: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 60_000));
}

function riskPriority(minutesSinceAssignment: number): LeadRiskPriority | null {
  if (minutesSinceAssignment >= 1_440) return "critical";
  if (minutesSinceAssignment >= 180) return "high";
  if (minutesSinceAssignment >= 60) return "medium";
  if (minutesSinceAssignment >= 15) return "low";
  return null;
}

export function buildLeadRiskQueue<TLead extends RiskLead>({
  leads,
  events,
  now,
}: {
  leads: readonly TLead[];
  events: readonly RiskEvent[];
  now: Date;
}) {
  const eventsByLead = new Map<string, RiskEvent[]>();
  for (const event of events) {
    const groupedEvents = eventsByLead.get(event.leadId) ?? [];
    groupedEvents.push(event);
    eventsByLead.set(event.leadId, groupedEvents);
  }

  return leads.flatMap((lead) => {
    if (!lead.callerId) return [];
    const leadEvents = (eventsByLead.get(lead.id) ?? [])
      .filter(({ occurredAt }) => occurredAt <= now)
      .sort((first, second) => first.occurredAt.getTime() - second.occurredAt.getTime());
    const assignment = [...leadEvents]
      .reverse()
      .find(
        (event) =>
          event.kind === "caller_assigned" && event.actorId === lead.callerId,
      );
    if (!assignment) return [];

    const feedbacks = leadEvents.filter(
      (event) =>
        isAuthoritativeCallerFeedback(event) &&
        event.occurredAt >= assignment.occurredAt,
    );
    const isContacted = feedbacks.some(isAuthoritativeCallerContact);
    if (isContacted) return [];

    const minutesSinceAssignment = differenceInMinutes(now, assignment.occurredAt);
    const priority = riskPriority(minutesSinceAssignment);
    if (!priority) return [];
    const lastAttemptAt = feedbacks.at(-1)?.occurredAt ?? null;

    return [{
      lead,
      priority,
      assignedAt: assignment.occurredAt,
      attemptCount: feedbacks.length,
      lastAttemptAt,
      minutesSinceAssignment,
      minutesSinceLastAttempt: lastAttemptAt
        ? differenceInMinutes(now, lastAttemptAt)
        : null,
    }];
  }).sort(
    (first, second) =>
      PRIORITY_RANK[second.priority] - PRIORITY_RANK[first.priority] ||
      second.minutesSinceAssignment - first.minutesSinceAssignment ||
      first.lead.name.localeCompare(second.lead.name),
  );
}

export async function listLeadRiskQueue({
  actorId,
  permissions,
  now = new Date(),
}: {
  actorId: string;
  permissions: readonly Permission[];
  now?: Date;
}) {
  const leads = await db.query.leads.findMany({
    with: { caller: true, closer: true },
    where: (table, { and, eq, isNotNull }) => and(
      isNotNull(table.callerId),
      permissions.includes("*") ? undefined : eq(table.callerId, actorId),
    ),
  });
  if (leads.length === 0) return [];

  const events = await db
    .select({
      id: leadActivityEvents.id,
      leadId: leadActivityEvents.leadId,
      actorId: leadActivityEvents.actorId,
      actorRole: leadActivityEvents.actorRole,
      kind: leadActivityEvents.kind,
      description: leadActivityEvents.description,
      metadata: leadActivityEvents.metadata,
      occurredAt: leadActivityEvents.occurredAt,
    })
    .from(leadActivityEvents)
    .where(and(
      inArray(leadActivityEvents.leadId, leads.map(({ id }) => id)),
      inArray(leadActivityEvents.kind, [
        LEAD_ACTIVITY_KIND.CALLER_ASSIGNED,
        LEAD_ACTIVITY_KIND.CALLER_FEEDBACK,
      ]),
    ))
    .orderBy(asc(leadActivityEvents.occurredAt));

  return buildLeadRiskQueue({ leads, events, now });
}
