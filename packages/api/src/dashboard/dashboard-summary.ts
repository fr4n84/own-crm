import { and, db, gte, inArray, lt } from "@crm-fran/db";
import {
  leadActivityEvents,
  leads,
  LEAD_ACTIVITY_KIND,
  type LeadActivityMetadata,
} from "@crm-fran/db/schema/index";

import { normalizeMadridRange } from "../commercial-observatory/domain";
import {
  getAuthoritativeFeedbackOutcome,
  isAuthoritativeCallerContact,
} from "../lead-feedback-events";

export const DASHBOARD_SUMMARY_TIME_ZONE = "Europe/Madrid";

export type DashboardSummaryInput = {
  from: string;
  to: string;
};

type SummaryEvent = {
  leadId: string;
  kind: string;
  actorRole?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function normalizeDashboardSummaryRange(input: DashboardSummaryInput, now = new Date()) {
  return normalizeMadridRange({ fromDay: input.from, toDay: input.to, now });
}

export function buildDashboardSummary(input: {
  createdLeadIds: readonly string[];
  events: readonly SummaryEvent[];
}) {
  const contacted = new Set<string>();
  const appointments = new Set<string>();
  const sales = new Set<string>();

  for (const event of input.events) {
    if (isAuthoritativeCallerContact(event)) contacted.add(event.leadId);
    if (
      event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_SCHEDULED ||
      event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_RESCHEDULED
    ) {
      appointments.add(event.leadId);
    }
    if (
      event.kind === LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK &&
      getAuthoritativeFeedbackOutcome(event) === "Venta"
    ) {
      sales.add(event.leadId);
    }
  }

  return {
    leads: new Set(input.createdLeadIds).size,
    contacted: contacted.size,
    appointments: appointments.size,
    sales: sales.size,
  };
}

export async function getDashboardSummary(input: DashboardSummaryInput, now = new Date()) {
  const range = normalizeDashboardSummaryRange(input, now);
  const [createdLeads, events] = await Promise.all([
    db
      .select({ id: leads.id })
      .from(leads)
      .where(and(gte(leads.createdAt, range.from), lt(leads.createdAt, range.to))),
    db
      .select({
        leadId: leadActivityEvents.leadId,
        kind: leadActivityEvents.kind,
        actorRole: leadActivityEvents.actorRole,
        description: leadActivityEvents.description,
        metadata: leadActivityEvents.metadata,
      })
      .from(leadActivityEvents)
      .where(
        and(
          gte(leadActivityEvents.occurredAt, range.from),
          lt(leadActivityEvents.occurredAt, range.to),
          inArray(leadActivityEvents.kind, [
            LEAD_ACTIVITY_KIND.CALLER_FEEDBACK,
            LEAD_ACTIVITY_KIND.APPOINTMENT_SCHEDULED,
            LEAD_ACTIVITY_KIND.APPOINTMENT_RESCHEDULED,
            LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK,
          ]),
        ),
      ),
  ]);

  return {
    timeZone: DASHBOARD_SUMMARY_TIME_ZONE,
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      requestedFromDay: range.requestedFromDay,
      requestedToDay: range.requestedToDay,
      lastClosedDay: range.lastClosedDay,
    },
    metrics: buildDashboardSummary({
      createdLeadIds: createdLeads.map((lead) => lead.id),
      events: events.map((event) => ({
        ...event,
        metadata: event.metadata as LeadActivityMetadata,
      })),
    }),
  };
}
