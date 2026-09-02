import { alias, and, asc, db, eq, gte, inArray, lte } from "@crm-fran/db";
import {
  leadActivityEvents,
  leads,
  LEAD_ACTIVITY_KIND,
  user,
  type LeadActivityMetadata,
  type LeadType,
} from "@crm-fran/db/schema/index";
import { COMMERCIAL_ROLE_IDS, isCallerRoleId, isCloserRoleId } from "@crm-fran/db/schema/auth";

import {
  buildConversionFunnel,
  selectConversionCohort,
  type FunnelLead,
} from "./conversion-funnel";

export type ConversionFunnelInput = {
  from: string;
  to: string;
  callerId?: string;
  closerId?: string;
  type?: LeadType;
};

function startOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function endOfDay(value: string) {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export async function getConversionFunnel(input: ConversionFunnelInput) {
  const caller = alias(user, "funnel_caller");
  const closer = alias(user, "funnel_closer");
  const from = startOfDay(input.from);
  const to = endOfDay(input.to);
  const conditions = [
    eq(leadActivityEvents.kind, LEAD_ACTIVITY_KIND.CALLER_ASSIGNED),
    gte(leadActivityEvents.occurredAt, from),
    lte(leadActivityEvents.occurredAt, to),
  ];
  if (input.callerId) conditions.push(eq(leadActivityEvents.actorId, input.callerId));
  if (input.type) conditions.push(eq(leads.type, input.type));

  const [assignmentRows, people] = await Promise.all([
    db
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        type: leads.type,
        callerId: leadActivityEvents.actorId,
        callerName: caller.name,
        closerId: leads.closerId,
        closerName: closer.name,
        assignedAt: leadActivityEvents.occurredAt,
      })
      .from(leadActivityEvents)
      .innerJoin(leads, eq(leads.id, leadActivityEvents.leadId))
      .leftJoin(caller, eq(caller.id, leadActivityEvents.actorId))
      .leftJoin(closer, eq(closer.id, leads.closerId))
      .where(and(...conditions))
      .orderBy(asc(leadActivityEvents.occurredAt)),
    db
      .select({ id: user.id, name: user.name, roleId: user.roleId })
      .from(user)
      .where(inArray(user.roleId, [...COMMERCIAL_ROLE_IDS]))
      .orderBy(asc(user.name)),
  ]);

  const usableAssignments = assignmentRows.filter(
    (row): row is typeof row & { callerId: string } => Boolean(row.callerId),
  );
  const leadIds = [...new Set(usableAssignments.map((row) => row.id))];
  const activityRows =
    leadIds.length === 0
      ? []
      : await db
          .select({
            id: leadActivityEvents.id,
            leadId: leadActivityEvents.leadId,
            kind: leadActivityEvents.kind,
            description: leadActivityEvents.description,
            metadata: leadActivityEvents.metadata,
            occurredAt: leadActivityEvents.occurredAt,
          })
          .from(leadActivityEvents)
          .where(inArray(leadActivityEvents.leadId, leadIds))
          .orderBy(asc(leadActivityEvents.occurredAt));
  const eventsByLead = new Map<string, FunnelLead["events"]>();
  for (const event of activityRows) {
    const events = eventsByLead.get(event.leadId) ?? [];
    events.push({
      id: event.id,
      kind: event.kind,
      description: event.description,
      metadata: event.metadata as LeadActivityMetadata,
      occurredAt: event.occurredAt,
    });
    eventsByLead.set(event.leadId, events);
  }

  const namesById = new Map(people.map((person) => [person.id, person.name]));
  const cohort = selectConversionCohort(
    usableAssignments.map((row) => {
      const events = eventsByLead.get(row.id) ?? [];
      const closerAssignment = events.find(
        (event) =>
          event.occurredAt >= row.assignedAt &&
          event.kind === LEAD_ACTIVITY_KIND.CLOSER_ASSIGNED &&
          typeof event.metadata.userId === "string",
      );
      const closerId =
        typeof closerAssignment?.metadata.userId === "string"
          ? closerAssignment.metadata.userId
          : row.closerId;
      return {
        ...row,
        closerId,
        closerName: closerId ? (namesById.get(closerId) ?? row.closerName) : null,
        events,
      };
    }),
    { from, to, callerId: input.callerId, closerId: input.closerId, type: input.type },
  );

  return {
    ...buildConversionFunnel(cohort),
    callers: people
      .filter((person) => isCallerRoleId(person.roleId))
      .map(({ id, name }) => ({ id, name })),
    closers: people
      .filter((person) => isCloserRoleId(person.roleId))
      .map(({ id, name }) => ({ id, name })),
    supportsSource: false,
    cohortDefinition: "Leads con asignación registrada dentro del intervalo seleccionado",
  };
}
