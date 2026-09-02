import { and, db, eq, gte, inArray, lte, or } from "@crm-fran/db";
import { alerts, leadActivityEvents, leads, LEAD_ACTIVITY_KIND, user, type LeadQASession } from "@crm-fran/db/schema/index";
import { COMMERCIAL_ROLE_IDS, isCallerRoleId, isCloserRoleId, type Permission } from "@crm-fran/db/schema/auth";

import { buildCommercialIntelligence, type IntelligenceLead, type IntelligenceObservation, type IntelligencePerson, type Outcome, type RecommendationOccurrence } from "./insights";
import { confirmedProfileValue, parseConfirmedFacts } from "../commercial-evidence/facts";
import { getAuthoritativeFeedbackOutcome, isAuthoritativeCallerContact } from "../lead-feedback-events";

export type CommercialIntelligenceInput = { actorId: string; permissions: readonly Permission[]; from: Date; to: Date; referenceSaleValue?: number | null };
type Activity = { id: string; leadId: string; actorId: string | null; actorRole?: string | null; kind: string; description: string | null; metadata: Record<string, unknown>; occurredAt: Date };
type Assignment = { role: "caller" | "closer"; userId: string; occurredAt: Date };
type OutcomeEvent = { kind: Outcome; occurredAt: Date };
type FollowUpAlert = { id: string; kind: string; nextShowAt: Date; resolvedAt: Date | null; dismissedAt: Date | null; expiredAt: Date | null };

function profile(questions: LeadQASession) { return confirmedProfileValue(parseConfirmedFacts(questions)); }
function metadataString(metadata: Record<string, unknown>, key: string) { const value = metadata[key]; return typeof value === "string" ? value : null; }
function actionType(metadata: Record<string, unknown>) {
  const stored = metadataString(metadata, "actionType");
  if (stored) return stored;
  const key = metadataString(metadata, "recommendationKey");
  return key?.startsWith("risk:") ? "no_contact" : key?.startsWith("alert:") ? "alerta" : "desconocida";
}
function assignmentUser(event: Activity) { return metadataString(event.metadata, "userId") ?? event.actorId; }
function sorted(events: readonly Activity[]) { return [...events].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()); }
function assignedAt(events: readonly Activity[], role: "caller" | "closer", at: Date, legacyId: string | null) {
  const kind = role === "caller" ? LEAD_ACTIVITY_KIND.CALLER_ASSIGNED : LEAD_ACTIVITY_KIND.CLOSER_ASSIGNED;
  const matching = sorted(events.filter((event) => event.kind === kind && event.occurredAt <= at));
  const latest = matching.at(-1);
  // Legacy rows without immutable assignment events retain the current owner only as a declared fallback.
  return latest ? assignmentUser(latest) : legacyId;
}
function outcomeFor(event: Activity): Outcome | null {
  if (event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_SCHEDULED || event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_RESCHEDULED) return "appointment";
  if (isAuthoritativeCallerContact(event)) return "contacted";
  if (event.kind !== LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK) return null;
  const outcome = getAuthoritativeFeedbackOutcome(event);
  if (outcome === "Venta") return "sale";
  if (["Agenda", "Reagenda", "Seguimiento"].includes(outcome ?? "")) return "show";
  return null;
}
function scheduledAt(event: Activity) {
  const date = metadataString(event.metadata, "scheduledDate");
  const time = metadataString(event.metadata, "scheduledTime");
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function withLegacyAssignmentFallback(input: { assignments: readonly Assignment[]; callerId: string | null; closerId: string | null; createdAt: Date }) {
  const assignments = [...input.assignments];
  if (!assignments.some((assignment) => assignment.role === "caller") && input.callerId) assignments.push({ role: "caller", userId: input.callerId, occurredAt: input.createdAt });
  if (!assignments.some((assignment) => assignment.role === "closer") && input.closerId) assignments.push({ role: "closer", userId: input.closerId, occurredAt: input.createdAt });
  return assignments;
}

export function selectOverdueFollowUpCommitment(input: { alerts: readonly FollowUpAlert[]; now: Date }) {
  const first = input.alerts
    .filter((alert) => (alert.kind === "future_call" || alert.kind === "follow_up") && !alert.resolvedAt && !alert.dismissedAt && !alert.expiredAt && alert.nextShowAt <= input.now)
    .sort((left, right) => left.nextShowAt.getTime() - right.nextShowAt.getTime() || left.id.localeCompare(right.id))[0];
  return first?.nextShowAt ?? null;
}

export function buildAssignmentEpochObservations(input: {
  assignments: readonly Assignment[];
  outcomes: readonly OutcomeEvent[];
  from: Date;
  to: Date;
  segment: Pick<IntelligenceObservation, "profile" | "source" | "campaign" | "type">;
}) {
  const values = new Map<string, IntelligenceObservation[]>();
  for (const role of ["caller", "closer"] as const) {
    const epochs = [...input.assignments].filter((assignment) => assignment.role === role).sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
    for (const [index, assignment] of epochs.entries()) {
      const next = epochs[index + 1];
      const start = new Date(Math.max(assignment.occurredAt.getTime(), input.from.getTime()));
      const end = new Date(Math.min(next?.occurredAt.getTime() ?? input.to.getTime(), input.to.getTime()));
      if (start >= end) continue;
      const outcomes = input.outcomes.filter((outcome) => outcome.occurredAt >= start && outcome.occurredAt < end);
      const firstContact = outcomes.find((outcome) => outcome.kind === "contacted");
      const observation: IntelligenceObservation = {
        ...input.segment,
        timeBucket: start.getHours() < 12 ? "morning" : start.getHours() < 18 ? "afternoon" : "evening",
        contacted: outcomes.some((outcome) => outcome.kind === "contacted"),
        appointment: outcomes.some((outcome) => outcome.kind === "appointment"),
        show: outcomes.some((outcome) => outcome.kind === "show"),
        sale: outcomes.some((outcome) => outcome.kind === "sale"),
        ...(role === "caller" && firstContact ? { assignmentToContactMinutes: Math.max(0, Math.round((firstContact.occurredAt.getTime() - assignment.occurredAt.getTime()) / 60_000)) } : {}),
      };
      const existing = values.get(assignment.userId) ?? [];
      existing.push(observation);
      values.set(assignment.userId, existing);
    }
  }
  return values;
}

export function collapseRecommendationLifecycle(input: { events: readonly Activity[]; outcomes: readonly OutcomeEvent[]; from: Date; to: Date; now: Date }) {
  const groups = new Map<string, Activity[]>();
  for (const event of input.events) {
    if (event.occurredAt < input.from || event.occurredAt > input.to) continue;
    if (![LEAD_ACTIVITY_KIND.RECOMMENDATION_SHOWN, LEAD_ACTIVITY_KIND.RECOMMENDATION_COMPLETED, LEAD_ACTIVITY_KIND.RECOMMENDATION_SKIPPED].includes(event.kind as "recommendation_shown" | "recommendation_completed" | "recommendation_skipped")) continue;
    const key = metadataString(event.metadata, "recommendationKey") ?? event.id;
    const groupKey = `${event.actorId ?? "system"}|${event.leadId}|${key}`;
    const group = groups.get(groupKey) ?? [];
    group.push(event);
    groups.set(groupKey, group);
  }
  const lifecycles = [...groups.values()].flatMap((events) => {
    const ordered = sorted(events);
    const shown = ordered.find((event) => event.kind === LEAD_ACTIVITY_KIND.RECOMMENDATION_SHOWN);
    if (!shown) return [];
    const terminal = ordered.find((event) => event.kind === LEAD_ACTIVITY_KIND.RECOMMENDATION_COMPLETED || event.kind === LEAD_ACTIVITY_KIND.RECOMMENDATION_SKIPPED);
    const state = terminal?.kind === LEAD_ACTIVITY_KIND.RECOMMENDATION_COMPLETED ? "completed" as const : terminal?.kind === LEAD_ACTIVITY_KIND.RECOMMENDATION_SKIPPED ? "skipped" as const : input.now.getTime() - shown.occurredAt.getTime() >= 24 * 60 * 60_000 ? "unworked" as const : null;
    if (!state) return [];
    return [{ leadId: shown.leadId, actorId: shown.actorId, recommendationKey: metadataString(shown.metadata, "recommendationKey") ?? shown.id, actionType: actionType(shown.metadata), occurredAt: shown.occurredAt, state, downstream: {} as Partial<Record<Outcome, boolean>> }];
  });
  for (const outcome of input.outcomes) {
    const target = lifecycles.filter((lifecycle) => lifecycle.occurredAt < outcome.occurredAt && outcome.occurredAt <= input.to).sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()).at(-1);
    if (target) target.downstream[outcome.kind] = true;
  }
  return lifecycles;
}

export async function getCommercialIntelligence(input: CommercialIntelligenceInput) {
  const global = input.permissions.includes("*");
  const rows = await db.select().from(leads).where(and(
    gte(leads.createdAt, input.from), lte(leads.createdAt, input.to),
    global ? undefined : or(eq(leads.callerId, input.actorId), eq(leads.closerId, input.actorId)),
  ));
  const leadIds = rows.map((row) => row.id);
  const [allEvents, userRows, alertRows] = await Promise.all([
    leadIds.length ? db.select({ id: leadActivityEvents.id, leadId: leadActivityEvents.leadId, actorId: leadActivityEvents.actorId, actorRole: leadActivityEvents.actorRole, kind: leadActivityEvents.kind, description: leadActivityEvents.description, metadata: leadActivityEvents.metadata, occurredAt: leadActivityEvents.occurredAt }).from(leadActivityEvents).where(and(inArray(leadActivityEvents.leadId, leadIds), lte(leadActivityEvents.occurredAt, input.to))) : Promise.resolve([]),
    db.select({ id: user.id, name: user.name, roleId: user.roleId }).from(user).where(inArray(user.roleId, [...COMMERCIAL_ROLE_IDS])),
    leadIds.length ? db.select({ id: alerts.id, leadId: alerts.leadId, kind: alerts.kind, nextShowAt: alerts.nextShowAt, resolvedAt: alerts.resolvedAt, dismissedAt: alerts.dismissedAt, expiredAt: alerts.expiredAt }).from(alerts).where(inArray(alerts.leadId, leadIds)) : Promise.resolve([]),
  ]);
  const events = allEvents.map((event) => ({ ...event, metadata: event.metadata as Record<string, unknown> } satisfies Activity));
  const eventsByLead = new Map<string, Activity[]>();
  for (const event of events) { const group = eventsByLead.get(event.leadId) ?? []; group.push(event); eventsByLead.set(event.leadId, group); }
  const within = (event: Activity) => event.occurredAt >= input.from && event.occurredAt <= input.to;
  const leadById = new Map(rows.map((row) => [row.id, row]));

  const workload = new Map<string, number>();
  for (const lead of rows) for (const id of [lead.callerId, lead.closerId]) if (id) workload.set(id, (workload.get(id) ?? 0) + 1);
  const observations = new Map<string, IntelligenceObservation[]>();
  const pushObservation = (id: string | null, value: IntelligenceObservation) => { if (!id) return; const group = observations.get(id) ?? []; group.push(value); observations.set(id, group); };

  const intelligenceLeads: IntelligenceLead[] = rows.map((lead) => {
    const history = sorted(eventsByLead.get(lead.id) ?? []);
    const outcomes = history.filter(within).flatMap((event) => { const kind = outcomeFor(event); return kind ? [{ kind, occurredAt: event.occurredAt, actorId: event.actorId }] : []; });
    const assignments = history.filter((event) => event.kind === LEAD_ACTIVITY_KIND.CALLER_ASSIGNED || event.kind === LEAD_ACTIVITY_KIND.CLOSER_ASSIGNED).flatMap((event) => {
      const userId = assignmentUser(event); if (!userId) return [];
      return [{ role: event.kind === LEAD_ACTIVITY_KIND.CALLER_ASSIGNED ? "caller" as const : "closer" as const, userId, occurredAt: event.occurredAt }];
    });
    const appointmentEvent = [...history].reverse().find((event) => within(event) && (event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_SCHEDULED || event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_RESCHEDULED));
    const legacyAssignments = withLegacyAssignmentFallback({ assignments, callerId: lead.callerId, closerId: lead.closerId, createdAt: lead.createdAt });
    const epochObservations = buildAssignmentEpochObservations({ assignments: legacyAssignments, outcomes, from: input.from, to: input.to, segment: { profile: profile(lead.questions), source: lead.source, campaign: lead.campaign, type: lead.type } });
    for (const [userId, values] of epochObservations) for (const value of values) pushObservation(userId, value);
    const followUpDueAt = selectOverdueFollowUpCommitment({ alerts: alertRows.filter((alert) => alert.leadId === lead.id), now: input.to });
    return { id: lead.id, name: lead.name, profile: profile(lead.questions), source: lead.source, campaign: lead.campaign, type: lead.type, createdAt: lead.createdAt, assignments: legacyAssignments, outcomes, scheduledAt: appointmentEvent ? scheduledAt(appointmentEvent) : null, appointmentConfirmed: Boolean(appointmentEvent), followUpDueAt };
  });
  const people: IntelligencePerson[] = userRows
    .filter((person) => global || person.id === input.actorId)
    .flatMap((person) => {
      const roles: Array<"caller" | "closer"> = [];
      if (isCallerRoleId(person.roleId)) roles.push("caller");
      if (isCloserRoleId(person.roleId)) roles.push("closer");
      return roles.map((role) => ({ id: person.id, name: person.name, role, workload: workload.get(person.id) ?? 0, capacity: 10, observations: observations.get(person.id) ?? [] }));
    });

  const recommendations: RecommendationOccurrence[] = [];
  for (const lead of intelligenceLeads) {
    const history = sorted(eventsByLead.get(lead.id) ?? []);
    const occurrences = collapseRecommendationLifecycle({ events: history, outcomes: lead.outcomes, from: input.from, to: input.to, now: input.to });
    for (const item of occurrences) {
      if (!global && item.actorId !== input.actorId) continue;
      recommendations.push({ recommendationKey: item.recommendationKey, actionType: item.actionType, state: item.state, profile: lead.profile, source: lead.source, campaign: lead.campaign, callerId: global ? assignedAt(history, "caller", item.occurredAt, leadById.get(lead.id)?.callerId ?? null) : input.actorId, occurredAt: item.occurredAt, downstream: item.downstream });
    }
  }
  const firstPass = buildCommercialIntelligence({ leads: intelligenceLeads, people, recommendations, referenceSaleValue: input.referenceSaleValue, now: input.to });
  const simulatedByLead = new Map(firstPass.assignments.map((assignment) => [assignment.leadId, assignment]));
  const leadsWithSimulation = intelligenceLeads.map((lead) => ({ ...lead, simulatedCallerId: simulatedByLead.get(lead.id)?.bestCallerId ?? null, simulatedCloserId: simulatedByLead.get(lead.id)?.bestCloserId ?? null }));
  return buildCommercialIntelligence({ leads: leadsWithSimulation, people, recommendations, referenceSaleValue: input.referenceSaleValue, now: input.to });
}
