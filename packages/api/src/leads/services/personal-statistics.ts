import { and, asc, db, gte, lte } from "@crm-fran/db";
import {
  leadActivityEvents,
  type LeadQASessionItem,
} from "@crm-fran/db/schema/index";

import { selectLeadWithUsers } from "../queries/index";

export const LEAD_CONDITION_LABELS = {
  unassigned: "Sin asignar",
  assigned: "Asignado",
  wrong_number: "Número erróneo",
  no_contact: "No contactado",
  future_call: "Llamar futuro",
  not_fit: "No encaja",
  not_interested: "No interesado",
  appointment: "Agenda",
  rescheduled: "Reagenda",
} as const;

export type LeadCondition = keyof typeof LEAD_CONDITION_LABELS;

export const CLOSER_CONDITION_LABELS = {
  appointment: "Agenda",
  rescheduled: "Reagenda",
  follow_up: "Seguimiento",
  sale: "Venta",
  not_interested: "No interesado",
  no_show: "No-show",
} as const;

export type CloserCondition = keyof typeof CLOSER_CONDITION_LABELS;

type LeadForStatistics = {
  state: string;
  questions: readonly LeadQASessionItem[];
};

export type PersonalStatisticsInput = {
  callerId?: string;
  closerId?: string;
  from?: string;
  to?: string;
};

const OUTCOME_CONDITIONS: Record<string, LeadCondition> = {
  "Llamar a futuro": "future_call",
  "No encaja": "not_fit",
  "No interesado": "not_interested",
  Agenda: "appointment",
};

const CLOSER_OUTCOME_CONDITIONS: Record<string, CloserCondition> = {
  Agenda: "appointment",
  Reagenda: "rescheduled",
  Seguimiento: "follow_up",
  Venta: "sale",
  "No interesado": "not_interested",
  "No-show": "no_show",
};

const DISCARDED_CONDITIONS = new Set<LeadCondition>([
  "wrong_number",
  "not_fit",
  "not_interested",
]);

function getLatestQuestionIndex(
  questions: readonly LeadQASessionItem[],
  questionKey: string,
): number {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    if (questions[index]?.questionKey === questionKey) return index;
  }
  return -1;
}

export function classifyLeadCondition(
  lead: LeadForStatistics,
): LeadCondition {
  if (lead.state === "número erróneo") return "wrong_number";

  const contactIndex = getLatestQuestionIndex(lead.questions, "isContacted");
  const outcomeIndex = getLatestQuestionIndex(lead.questions, "callerOutcome");
  const contactAnswer = lead.questions[contactIndex]?.answer;

  if (contactAnswer === "No" && contactIndex > outcomeIndex) {
    return "no_contact";
  }

  const outcomeAnswer = lead.questions[outcomeIndex]?.answer;
  const outcomeCondition = outcomeAnswer
    ? OUTCOME_CONDITIONS[outcomeAnswer]
    : undefined;

  if (outcomeCondition === "appointment") {
    const rescheduledIndex = getLatestQuestionIndex(
      lead.questions,
      "appointmentRescheduled",
    );
    return lead.questions[rescheduledIndex]?.answer === "Si"
      ? "rescheduled"
      : "appointment";
  }

  if (outcomeCondition) return outcomeCondition;
  if (contactAnswer === "No") return "no_contact";
  return lead.state === "sin asignar" ? "unassigned" : "assigned";
}

export function classifyCloserCondition(
  lead: LeadForStatistics,
): CloserCondition | undefined {
  const outcomeIndex = getLatestQuestionIndex(
    lead.questions,
    "closerOutcome",
  );
  const callerOutcomeIndex = getLatestQuestionIndex(
    lead.questions,
    "callerOutcome",
  );
  const rescheduledIndex = getLatestQuestionIndex(
    lead.questions,
    "appointmentRescheduled",
  );
  const latestSchedulingIndex = Math.max(callerOutcomeIndex, rescheduledIndex);
  const contactedIndex = getLatestQuestionIndex(
    lead.questions,
    "isContacted",
  );
  const contactedQuestion = lead.questions[contactedIndex];
  if (
    contactedQuestion?.authorRole === "closer" &&
    contactedQuestion.answer === "No" &&
    contactedIndex > latestSchedulingIndex
  ) {
    return "no_show";
  }
  const outcomeAnswer = lead.questions[outcomeIndex]?.answer;
  const closerCondition = outcomeAnswer
    ? CLOSER_OUTCOME_CONDITIONS[outcomeAnswer]
    : undefined;

  if (closerCondition && outcomeIndex > latestSchedulingIndex) {
    return closerCondition;
  }

  if (lead.questions[callerOutcomeIndex]?.answer !== "Agenda") {
    return undefined;
  }

  return lead.questions[rescheduledIndex]?.answer === "Si"
    ? "rescheduled"
    : "appointment";
}

export function aggregateLeadConditions(
  leads: readonly LeadForStatistics[],
) {
  const counts = Object.fromEntries(
    Object.keys(LEAD_CONDITION_LABELS).map((condition) => [condition, 0]),
  ) as Record<LeadCondition, number>;

  for (const lead of leads) {
    counts[classifyLeadCondition(lead)] += 1;
  }

  return {
    total: leads.length,
    discarded: [...DISCARDED_CONDITIONS].reduce(
      (total, condition) => total + counts[condition],
      0,
    ),
    counts,
  };
}

export function aggregateCloserConditions(
  leads: readonly LeadForStatistics[],
) {
  const counts = Object.fromEntries(
    Object.keys(CLOSER_CONDITION_LABELS).map((condition) => [condition, 0]),
  ) as Record<CloserCondition, number>;

  for (const lead of leads) {
    const condition = classifyCloserCondition(lead);
    if (condition) counts[condition] += 1;
  }

  return {
    total: leads.length,
    counts,
  };
}

type HistoricalStatisticsEvent = {
  leadId: string;
  actorId: string | null;
  actorRole: string | null;
  kind: string;
  description: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

type HistoricalStatisticsFilters = {
  mode: "caller" | "closer";
  userId?: string;
  from?: Date;
  to?: Date;
};

const EVENT_PRIORITY: Record<string, number> = {
  caller_assigned: 0,
  closer_assigned: 0,
  state_changed: 1,
  appointment_scheduled: 2,
  appointment_rescheduled: 2,
  caller_feedback: 3,
  closer_feedback: 3,
};

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" ? value : undefined;
}

function readEventQuestions(event: HistoricalStatisticsEvent) {
  const questions = event.metadata.questions;
  return Array.isArray(questions)
    ? (questions as readonly LeadQASessionItem[])
    : [];
}

function eventOwnerId(
  event: HistoricalStatisticsEvent,
  mode: HistoricalStatisticsFilters["mode"],
) {
  if (mode === "caller") {
    if (
      event.kind === "caller_assigned" ||
      (event.actorRole === "caller" &&
        (event.kind === "caller_feedback" || event.kind === "state_changed"))
    ) {
      return event.actorId;
    }
    return undefined;
  }

  if (event.kind === "closer_assigned") {
    return readMetadataString(event.metadata, "userId");
  }
  if (
    event.kind === "appointment_scheduled" ||
    event.kind === "appointment_rescheduled"
  ) {
    return readMetadataString(event.metadata, "closerId");
  }
  if (event.kind === "closer_feedback" && event.actorRole === "closer") {
    return event.actorId;
  }
  return undefined;
}

function classifyCallerEvent(event: HistoricalStatisticsEvent): LeadCondition {
  if (event.kind === "caller_assigned") return "assigned";
  const state = readMetadataString(event.metadata, "state") ?? "Asignado";
  return classifyLeadCondition({ state, questions: readEventQuestions(event) });
}

function classifyCloserEvent(
  event: HistoricalStatisticsEvent,
): CloserCondition {
  if (event.kind === "appointment_rescheduled") return "rescheduled";
  if (
    event.kind === "closer_assigned" ||
    event.kind === "appointment_scheduled"
  ) {
    return "appointment";
  }

  const questions = readEventQuestions(event);
  const contact = [...questions]
    .reverse()
    .find((item) => item.questionKey === "isContacted")?.answer;
  if (contact === "No") return "no_show";
  const outcome =
    [...questions]
      .reverse()
      .find((item) => item.questionKey === "closerOutcome")?.answer ??
    event.description ??
    undefined;
  return outcome ? (CLOSER_OUTCOME_CONDITIONS[outcome] ?? "appointment") : "appointment";
}

export function aggregateHistoricalConditions(
  events: readonly HistoricalStatisticsEvent[],
  filters: HistoricalStatisticsFilters,
) {
  const latestByLead = new Map<string, HistoricalStatisticsEvent>();

  for (const event of events) {
    if (filters.from && event.occurredAt < filters.from) continue;
    if (filters.to && event.occurredAt > filters.to) continue;
    const ownerId = eventOwnerId(event, filters.mode);
    if (!ownerId || (filters.userId && ownerId !== filters.userId)) continue;

    const previous = latestByLead.get(event.leadId);
    const isLater = !previous || event.occurredAt > previous.occurredAt;
    const hasHigherPriorityAtSameTime =
      previous &&
      event.occurredAt.getTime() === previous.occurredAt.getTime() &&
      (EVENT_PRIORITY[event.kind] ?? -1) > (EVENT_PRIORITY[previous.kind] ?? -1);
    if (isLater || hasHigherPriorityAtSameTime) {
      latestByLead.set(event.leadId, event);
    }
  }

  if (filters.mode === "closer") {
    const counts = Object.fromEntries(
      Object.keys(CLOSER_CONDITION_LABELS).map((condition) => [condition, 0]),
    ) as Record<CloserCondition, number>;
    for (const event of latestByLead.values()) {
      counts[classifyCloserEvent(event)] += 1;
    }
    return { total: latestByLead.size, counts };
  }

  const counts = Object.fromEntries(
    Object.keys(LEAD_CONDITION_LABELS).map((condition) => [condition, 0]),
  ) as Record<LeadCondition, number>;
  for (const event of latestByLead.values()) {
    counts[classifyCallerEvent(event)] += 1;
  }
  return {
    total: latestByLead.size,
    discarded: [...DISCARDED_CONDITIONS].reduce(
      (total, condition) => total + counts[condition],
      0,
    ),
    counts,
  };
}

function startOfDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function endOfDay(value: string): Date {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isImportedLegacyLead(lead: LeadForStatistics) {
  return lead.questions.some(
    (question) => question.questionKey === "csvSourceState",
  );
}

function mergeStatisticsAggregates(
  historical: {
    total: number;
    counts: Record<string, number>;
    discarded?: number;
  },
  legacy: {
    total: number;
    counts: Record<string, number>;
    discarded?: number;
  },
) {
  return {
    total: historical.total + legacy.total,
    counts: Object.fromEntries(
      Object.keys(historical.counts).map((condition) => [
        condition,
        (historical.counts[condition] ?? 0) +
          (legacy.counts[condition] ?? 0),
      ]),
    ),
    ...(historical.discarded !== undefined || legacy.discarded !== undefined
      ? {
          discarded:
            (historical.discarded ?? 0) + (legacy.discarded ?? 0),
        }
      : {}),
  };
}

export async function getPersonalStatistics(input: PersonalStatisticsInput) {
  const rows = await selectLeadWithUsers();
  const from = input.from ? startOfDay(input.from) : undefined;
  const to = input.to ? endOfDay(input.to) : undefined;
  const filteredRows = rows.filter((lead) => {
    if (input.callerId && lead.callerId !== input.callerId) return false;
    if (input.closerId && lead.closerId !== input.closerId) return false;
    return true;
  });
  const callers = new Map<string, string>();
  const closers = new Map<string, string>();

  for (const lead of rows) {
    if (lead.caller?.id && lead.caller.name) {
      callers.set(lead.caller.id, lead.caller.name);
    }
    if (lead.closer?.id && lead.closer.name) {
      closers.set(lead.closer.id, lead.closer.name);
    }
  }

  const mode = input.closerId ? "closer" : "caller";
  const hasHistoricalInterval = Boolean(from || to);
  const historicalEvents = hasHistoricalInterval
    ? await db
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
        .where(
          and(
            from ? gte(leadActivityEvents.occurredAt, from) : undefined,
            to ? lte(leadActivityEvents.occurredAt, to) : undefined,
          ),
        )
        .orderBy(asc(leadActivityEvents.occurredAt))
    : [];
  const historicalLeadIds = new Set(
    historicalEvents.map((event) => event.leadId),
  );
  const legacyRows = hasHistoricalInterval
    ? filteredRows.filter(
        (lead) =>
          isImportedLegacyLead(lead) &&
          !historicalLeadIds.has(lead.id) &&
          (!from || lead.createdAt >= from) &&
          (!to || lead.createdAt <= to),
      )
    : [];
  const aggregate = !hasHistoricalInterval
    ? mode === "closer"
      ? aggregateCloserConditions(filteredRows)
      : aggregateLeadConditions(filteredRows)
    : mode === "closer"
      ? mergeStatisticsAggregates(
          aggregateHistoricalConditions(historicalEvents, {
            mode,
            userId: input.closerId,
            from,
            to,
          }),
          aggregateCloserConditions(legacyRows),
        )
      : mergeStatisticsAggregates(
          aggregateHistoricalConditions(historicalEvents, {
            mode,
            userId: input.callerId,
            from,
            to,
          }),
          aggregateLeadConditions(legacyRows),
        );

  return {
    ...aggregate,
    mode,
    conditions:
      mode === "closer" ? CLOSER_CONDITION_LABELS : LEAD_CONDITION_LABELS,
    callers: [...callers].map(([id, name]) => ({ id, name })),
    closers: [...closers].map(([id, name]) => ({ id, name })),
  };
}
