import { alias, and, asc, db, eq, gte, inArray, lte } from "@crm-fran/db";
import {
  leadActivityEvents,
  leads,
  LEAD_ACTIVITY_KIND,
  qualityControlSettings,
  user,
  type LeadActivityMetadata,
} from "@crm-fran/db/schema/index";
import { COMMERCIAL_ROLE_IDS, isCallerRoleId, isCloserRoleId } from "@crm-fran/db/schema/auth";

import {
  buildQualityControls,
  type QualityLead,
  type QualitySettings,
} from "./quality-controls";

export type QualityControlsInput = {
  from: string;
  to: string;
  callerId?: string;
  closerId?: string;
  initializeSettings?: boolean;
};

const DEFAULT_SETTINGS: QualitySettings = {
  callerAbandonedHours: 24,
  closerAbandonedHours: 24,
  callerFollowUpGraceHours: 0,
  closerFollowUpGraceHours: 0,
  callerLowConversionPercent: 20,
  closerLowConversionPercent: 20,
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

export async function getQualitySettings(options?: { initialize?: boolean }) {
  if (options?.initialize !== false) {
    await db
      .insert(qualityControlSettings)
      .values({ id: "global", ...DEFAULT_SETTINGS })
      .onConflictDoNothing();
  }

  const [settings] = await db
    .select()
    .from(qualityControlSettings)
    .where(eq(qualityControlSettings.id, "global"))
    .limit(1);

  return settings ?? { id: "global", ...DEFAULT_SETTINGS };
}

export async function updateQualitySettings(
  actorId: string,
  input: QualitySettings,
) {
  const [settings] = await db
    .insert(qualityControlSettings)
    .values({ id: "global", ...input, updatedById: actorId })
    .onConflictDoUpdate({
      target: qualityControlSettings.id,
      set: { ...input, updatedById: actorId, updatedAt: new Date() },
    })
    .returning();

  return settings;
}

export async function getQualityControls(input: QualityControlsInput) {
  const closer = alias(user, "quality_closer");
  const from = startOfDay(input.from);
  const to = endOfDay(input.to);

  const [assignmentRows, people, settings] = await Promise.all([
    db
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        closerId: leads.closerId,
        closerName: closer.name,
        callerId: leadActivityEvents.actorId,
        assignedAt: leadActivityEvents.occurredAt,
      })
      .from(leadActivityEvents)
      .innerJoin(leads, eq(leads.id, leadActivityEvents.leadId))
      .leftJoin(closer, eq(closer.id, leads.closerId))
      .where(
        and(
          eq(leadActivityEvents.kind, LEAD_ACTIVITY_KIND.CALLER_ASSIGNED),
          gte(leadActivityEvents.occurredAt, from),
          lte(leadActivityEvents.occurredAt, to),
        ),
      )
      .orderBy(asc(leadActivityEvents.occurredAt)),
    db
      .select({ id: user.id, name: user.name, roleId: user.roleId })
      .from(user)
      .where(inArray(user.roleId, [...COMMERCIAL_ROLE_IDS]))
      .orderBy(asc(user.name)),
    getQualitySettings({
      initialize: input.initializeSettings !== false,
    }),
  ]);

  const assignmentsByLead = new Map<string, (typeof assignmentRows)[number]>();
  for (const row of assignmentRows) assignmentsByLead.set(row.id, row);
  const assignments = [...assignmentsByLead.values()];
  const leadIds = assignments.map((row) => row.id);
  const activityRows =
    leadIds.length === 0
      ? []
      : await db
          .select({
            leadId: leadActivityEvents.leadId,
            actorId: leadActivityEvents.actorId,
            actorRole: leadActivityEvents.actorRole,
            kind: leadActivityEvents.kind,
            description: leadActivityEvents.description,
            metadata: leadActivityEvents.metadata,
            occurredAt: leadActivityEvents.occurredAt,
          })
          .from(leadActivityEvents)
          .where(inArray(leadActivityEvents.leadId, leadIds))
          .orderBy(asc(leadActivityEvents.occurredAt));

  const eventsByLead = new Map<string, typeof activityRows>();
  for (const event of activityRows) {
    const events = eventsByLead.get(event.leadId) ?? [];
    events.push(event);
    eventsByLead.set(event.leadId, events);
  }

  const namesById = new Map(people.map((person) => [person.id, person.name]));
  const cohort: QualityLead[] = assignments.flatMap((row) => {
    const rawEvents = eventsByLead.get(row.id) ?? [];
    const latestCallerAssignment = rawEvents.findLast(
      (event) => event.kind === LEAD_ACTIVITY_KIND.CALLER_ASSIGNED && event.actorId,
    );
    const latestCloserAssignment = rawEvents.findLast(
      (event) =>
        event.kind === LEAD_ACTIVITY_KIND.CLOSER_ASSIGNED &&
        typeof (event.metadata as LeadActivityMetadata).userId === "string",
    );
    const callerId = latestCallerAssignment?.actorId ?? row.callerId;
    const closerId =
      typeof (latestCloserAssignment?.metadata as LeadActivityMetadata | undefined)?.userId ===
      "string"
        ? ((latestCloserAssignment?.metadata as LeadActivityMetadata).userId as string)
        : row.closerId;

    if (!callerId) return [];
    if (input.callerId && callerId !== input.callerId) return [];
    if (input.closerId && closerId !== input.closerId) return [];

    return [
      {
        id: row.id,
        name: row.name,
        email: row.email,
        callerId,
        callerName: namesById.get(callerId) ?? "Sin nombre",
        closerId,
        closerName: closerId ? (namesById.get(closerId) ?? row.closerName) : null,
        assignedAt: row.assignedAt,
        events: rawEvents.map((event) => ({
          kind: event.kind,
          actorRole: event.actorRole,
          description: event.description,
          occurredAt: event.occurredAt,
          metadata: event.metadata as LeadActivityMetadata,
        })),
      },
    ];
  });

  return {
    ...buildQualityControls(cohort, settings),
    settings,
    callers: people
      .filter((person) => isCallerRoleId(person.roleId))
      .map(({ id, name }) => ({ id, name })),
    closers: people
      .filter((person) => isCloserRoleId(person.roleId))
      .map(({ id, name }) => ({ id, name })),
  };
}
