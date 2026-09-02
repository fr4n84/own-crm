import { getAuthoritativeFeedbackOutcome, isAuthoritativeCallerContact, isAuthoritativeCallerFeedback } from "../lead-feedback-events";

export const CONVERSION_STAGE = {
  ASSIGNED: "assigned",
  CONTACTED: "contacted",
  APPOINTMENT: "appointment",
  SHOW: "show",
  SALE: "sale",
} as const;

export type ConversionStage =
  (typeof CONVERSION_STAGE)[keyof typeof CONVERSION_STAGE];

export type ConversionMilestone = {
  kind: Exclude<ConversionStage, "assigned">;
  occurredAt: Date;
};

type FunnelEvent = {
  id: string;
  kind: string;
  description: string | null;
  occurredAt: Date;
  metadata: Record<string, unknown>;
  actorRole?: string | null;
};

export type FunnelLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  type: "maestra" | "vsl";
  callerId: string;
  callerName: string | null;
  closerId: string | null;
  closerName: string | null;
  assignedAt: Date;
  events: FunnelEvent[];
};

export type ConversionCohortFilters = {
  from: Date;
  to: Date;
  callerId?: string;
  closerId?: string;
  type?: FunnelLead["type"];
};

const ATTENDED_OUTCOMES = new Set([
  "Agenda",
  "Reagenda",
  "Seguimiento",
  "Venta",
  "No interesado",
]);

export function getAuthoritativeConversionMilestones(
  events: readonly FunnelEvent[],
): ConversionMilestone[] {
  return events.flatMap<ConversionMilestone>((event) => {
    if (
      isAuthoritativeCallerContact(event)
    ) return [{ kind: "contacted" as const, occurredAt: event.occurredAt }];
    if (event.kind === "appointment_scheduled" || event.kind === "appointment_rescheduled") {
      return [{ kind: "appointment" as const, occurredAt: event.occurredAt }];
    }
    if (event.kind === "closer_feedback") {
      const outcome = getAuthoritativeFeedbackOutcome(event);
      const milestones: { kind: "show" | "sale"; occurredAt: Date }[] = [];
      if (ATTENDED_OUTCOMES.has(outcome ?? "")) milestones.push({ kind: "show", occurredAt: event.occurredAt });
      if (outcome === "Venta") milestones.push({ kind: "sale", occurredAt: event.occurredAt });
      return milestones;
    }
    return [];
  });
}

const STAGE_LABELS: Record<ConversionStage, string> = {
  assigned: "Asignados",
  contacted: "Contactados",
  appointment: "Agenda",
  show: "Show",
  sale: "Venta",
};

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10;
}

export function getConversionEventOutcome(event: FunnelEvent) {
  return getAuthoritativeFeedbackOutcome(event) ?? undefined;
}

export function classifyConversionLead(lead: FunnelLead) {
  const events = lead.events
    .filter((event) => event.occurredAt >= lead.assignedAt)
    .sort((first, second) => first.occurredAt.getTime() - second.occurredAt.getTime());
  const callerFeedback = events.filter(isAuthoritativeCallerFeedback);
  const closerFeedback = events.filter((event) => event.kind === "closer_feedback" && getAuthoritativeFeedbackOutcome(event) !== null);
  const callerOutcomes = callerFeedback.map(getConversionEventOutcome);
  const closerOutcomes = closerFeedback.map(getConversionEventOutcome);
  const latestCloserOutcome = closerOutcomes.at(-1);
  const contacted = callerFeedback.some(isAuthoritativeCallerContact);
  const appointment =
    contacted &&
    events.some(
      (event) =>
        event.kind === "appointment_scheduled" ||
        event.kind === "appointment_rescheduled",
    );
  const show =
    appointment && closerOutcomes.some((outcome) => ATTENDED_OUTCOMES.has(outcome ?? ""));
  const sale = show && closerOutcomes.includes("Venta");

  return {
    contacted,
    appointment,
    show,
    sale,
    callerOutcomes,
    closerOutcomes,
    latestCloserOutcome,
  };
}

export function selectConversionCohort(
  leads: readonly FunnelLead[],
  filters: ConversionCohortFilters,
) {
  return leads.filter(
    (lead) =>
      lead.assignedAt >= filters.from &&
      lead.assignedAt <= filters.to &&
      (!filters.callerId || lead.callerId === filters.callerId) &&
      (!filters.closerId || lead.closerId === filters.closerId) &&
      (!filters.type || lead.type === filters.type),
  );
}

export function buildConversionFunnel(input: readonly FunnelLead[]) {
  const leadsById = new Map<string, FunnelLead>();
  for (const lead of input) {
    const existing = leadsById.get(lead.id);
    if (!existing) {
      leadsById.set(lead.id, { ...lead, events: [...lead.events] });
      continue;
    }
    const events = new Map(existing.events.map((event) => [event.id, event]));
    for (const event of lead.events) events.set(event.id, event);
    leadsById.set(lead.id, {
      ...(lead.assignedAt < existing.assignedAt ? lead : existing),
      events: [...events.values()],
    });
  }

  const stageLeads: Record<ConversionStage, FunnelLead[]> = {
    assigned: [],
    contacted: [],
    appointment: [],
    show: [],
    sale: [],
  };
  const exits = { noShow: 0, notInterested: 0, followUp: 0 };

  for (const lead of leadsById.values()) {
    const {
      contacted,
      appointment,
      show,
      sale,
      callerOutcomes,
      closerOutcomes,
      latestCloserOutcome,
    } = classifyConversionLead(lead);

    stageLeads.assigned.push(lead);
    if (contacted) stageLeads.contacted.push(lead);
    if (appointment) stageLeads.appointment.push(lead);
    if (show) stageLeads.show.push(lead);
    if (sale) stageLeads.sale.push(lead);

    if (appointment && closerOutcomes.includes("No-show")) exits.noShow += 1;
    if (
      callerOutcomes.includes("No interesado") ||
      closerOutcomes.includes("No interesado")
    ) {
      exits.notInterested += 1;
    }
    if (latestCloserOutcome === "Seguimiento") exits.followUp += 1;
  }

  const order = Object.values(CONVERSION_STAGE);
  const stages = order.map((key, index) => {
    const previousKey = order[index - 1];
    const previousCount = previousKey
      ? stageLeads[previousKey].length
      : stageLeads.assigned.length;
    const count = stageLeads[key].length;
    return {
      key,
      label: STAGE_LABELS[key],
      count,
      previousConversion:
        index === 0
          ? 100
          : previousCount === 0
            ? 0
            : roundPercentage((count / previousCount) * 100),
      leads: stageLeads[key].map(({ events: _events, ...lead }) => lead),
    };
  });
  const assigned = stageLeads.assigned.length;

  return {
    stages,
    exits,
    totalConversion:
      assigned === 0
        ? 0
        : roundPercentage((stageLeads.sale.length / assigned) * 100),
  };
}
