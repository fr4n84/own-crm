import { asc, db, eq } from "@crm-fran/db";
import {
  leadActivityEvents,
  leads,
  LEAD_ACTIVITY_KIND,
  type LeadActivityKind,
  type LeadActivityMetadata,
  type LeadQASessionItem,
} from "@crm-fran/db/schema/index";

type LegacyLead = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  callerId: string | null;
  closerId: string | null;
  questions: readonly LeadQASessionItem[];
};

type LegacyAlert = {
  id: string;
  kind: string;
  message: string;
  severity: string;
  targetUserId: string | null;
  createdAt: Date;
  dismissedAt: Date | null;
  resolvedAt: Date | null;
  dismissedBy: string | null;
};

export type LeadActivityItem = {
  id: string;
  leadId: string;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  kind: LeadActivityKind;
  title: string;
  description: string | null;
  metadata: LeadActivityMetadata;
  dedupeKey: string;
  occurredAt: Date | null;
  createdAt: Date;
  reconstructed: boolean;
};

type AppendLeadActivityInput = {
  leadId: string;
  actorId?: string | null;
  actorRole?: string | null;
  kind: LeadActivityKind;
  title: string;
  description?: string | null;
  metadata?: LeadActivityMetadata;
  dedupeKey: string;
  occurredAt?: Date;
};

type ActivityTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function appendLeadActivity(
  tx: ActivityTransaction,
  input: AppendLeadActivityInput,
) {
  await tx
    .insert(leadActivityEvents)
    .values({
      id: crypto.randomUUID(),
      leadId: input.leadId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      kind: input.kind,
      title: input.title,
      description: input.description,
      metadata: input.metadata ?? {},
      dedupeKey: input.dedupeKey,
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing();
}

function legacyItem(
  input: Omit<LeadActivityItem, "id" | "createdAt" | "actorName" | "reconstructed">,
): LeadActivityItem {
  return {
    ...input,
    id: `legacy:${input.dedupeKey}`,
    actorName: null,
    createdAt: input.occurredAt ?? new Date(0),
    reconstructed: true,
  };
}

function parseAppointmentHistory(questions: readonly LeadQASessionItem[]) {
  const answer = [...questions]
    .reverse()
    .find((question) => question.questionKey === "appointmentHistory")?.answer;
  if (!answer) return [];

  try {
    const parsed: unknown = JSON.parse(answer);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { date: string; time: string } =>
        typeof item === "object" &&
        item !== null &&
        "date" in item &&
        typeof item.date === "string" &&
        "time" in item &&
        typeof item.time === "string",
    );
  } catch {
    return [];
  }
}

export function buildLegacyLeadActivity({
  lead,
  alerts,
}: {
  lead: LegacyLead;
  alerts: readonly LegacyAlert[];
}): LeadActivityItem[] {
  const items: LeadActivityItem[] = [
    legacyItem({
      leadId: lead.id,
      actorId: null,
      actorRole: null,
      kind: LEAD_ACTIVITY_KIND.LEAD_CREATED,
      title: "Lead creado",
      description: "Registro inicial del lead",
      metadata: { reconstructed: true },
      dedupeKey: `lead_created:${lead.id}`,
      occurredAt: lead.createdAt,
    }),
  ];

  if (lead.callerId) {
    items.push(
      legacyItem({
        leadId: lead.id,
        actorId: lead.callerId,
        actorRole: "caller",
        kind: LEAD_ACTIVITY_KIND.CALLER_ASSIGNED,
        title: "Caller asignado",
        description: "Asignación actual reconstruida",
        metadata: { userId: lead.callerId, reconstructed: true },
        dedupeKey: `caller_assigned:${lead.id}:${lead.callerId}:legacy`,
        occurredAt: null,
      }),
    );
  }

  if (lead.closerId) {
    items.push(
      legacyItem({
        leadId: lead.id,
        actorId: lead.closerId,
        actorRole: "closer",
        kind: LEAD_ACTIVITY_KIND.CLOSER_ASSIGNED,
        title: "Closer asignado",
        description: "Asignación actual reconstruida",
        metadata: { userId: lead.closerId, reconstructed: true },
        dedupeKey: `closer_assigned:${lead.id}:${lead.closerId}:legacy`,
        occurredAt: null,
      }),
    );
  }

  for (const [index, appointment] of parseAppointmentHistory(lead.questions).entries()) {
    const isReschedule = index > 0;
    items.push(
      legacyItem({
        leadId: lead.id,
        actorId: null,
        actorRole: null,
        kind: isReschedule
          ? LEAD_ACTIVITY_KIND.APPOINTMENT_RESCHEDULED
          : LEAD_ACTIVITY_KIND.APPOINTMENT_SCHEDULED,
        title: isReschedule ? "Agenda reprogramada" : "Agenda programada",
        description: `${appointment.date} a las ${appointment.time}`,
        metadata: {
          scheduledDate: appointment.date,
          scheduledTime: appointment.time,
          reconstructed: true,
        },
        dedupeKey: `appointment:${lead.id}:${appointment.date}:${appointment.time}`,
        occurredAt: null,
      }),
    );
  }

  for (const alert of alerts) {
    const alertMetadata = {
      alertId: alert.id,
      alertKind: alert.kind,
      severity: alert.severity,
      targetUserId: alert.targetUserId,
      reconstructed: true,
    };
    items.push(
      legacyItem({
        leadId: lead.id,
        actorId: null,
        actorRole: null,
        kind: LEAD_ACTIVITY_KIND.ALERT_CREATED,
        title: "Alerta creada",
        description: alert.message,
        metadata: alertMetadata,
        dedupeKey: `alert_created:${alert.id}`,
        occurredAt: alert.createdAt,
      }),
    );
    if (alert.resolvedAt) {
      items.push(
        legacyItem({
          leadId: lead.id,
          actorId: null,
          actorRole: null,
          kind: LEAD_ACTIVITY_KIND.ALERT_RESOLVED,
          title: "Alerta resuelta",
          description: alert.message,
          metadata: alertMetadata,
          dedupeKey: `alert_resolved:${alert.id}`,
          occurredAt: alert.resolvedAt,
        }),
      );
    }
    if (alert.dismissedAt) {
      items.push(
        legacyItem({
          leadId: lead.id,
          actorId: alert.dismissedBy,
          actorRole: null,
          kind: LEAD_ACTIVITY_KIND.ALERT_DISMISSED,
          title: "Alerta descartada",
          description: alert.message,
          metadata: alertMetadata,
          dedupeKey: `alert_dismissed:${alert.id}`,
          occurredAt: alert.dismissedAt,
        }),
      );
    }
  }

  return items;
}

export function mergeLeadActivity(
  items: readonly LeadActivityItem[],
): LeadActivityItem[] {
  const deduped = new Map<string, LeadActivityItem>();
  for (const item of items) {
    const existing = deduped.get(item.dedupeKey);
    if (!existing || (existing.reconstructed && !item.reconstructed)) {
      deduped.set(item.dedupeKey, item);
    }
  }

  return [...deduped.values()].sort((first, second) => {
    if (!first.occurredAt && !second.occurredAt) return 0;
    if (!first.occurredAt) return 1;
    if (!second.occurredAt) return -1;
    return second.occurredAt.getTime() - first.occurredAt.getTime();
  });
}

export async function getLeadActivity(leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return null;

  const [ledger, legacyAlerts] = await Promise.all([
    db.query.leadActivityEvents.findMany({
      with: { actor: { columns: { id: true, name: true } } },
      where: (table, { eq }) => eq(table.leadId, leadId),
      orderBy: asc(leadActivityEvents.occurredAt),
    }),
    db.query.alerts.findMany({
      where: (table, { eq }) => eq(table.leadId, leadId),
    }),
  ]);

  const ledgerItems: LeadActivityItem[] = ledger.map((event) => ({
    ...event,
    actorName: event.actor?.name ?? null,
    reconstructed: false,
  }));

  return mergeLeadActivity([
    ...ledgerItems,
    ...buildLegacyLeadActivity({ lead, alerts: legacyAlerts }),
  ]);
}
