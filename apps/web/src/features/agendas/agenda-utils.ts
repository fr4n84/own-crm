export type AgendaQuestion = {
  questionKey?: string;
  question?: string;
  answer: string;
  authorRole: "caller" | "closer";
  authorId?: string | null;
};

export type AgendaLeadInput = {
  id: string;
  name: string;
  phone?: string;
  feedback?: string;
  caller: { id: string; name: string } | null;
  closer: { id: string; name: string } | null;
  questions: readonly AgendaQuestion[];
};

export type AgendaLead = AgendaLeadInput & {
  scheduledDate: string;
  scheduledTime: string;
  closerOutcome: CloserOutcome | null;
};

export type AgendaCloser = { id: string; name: string };

export const CLOSER_OUTCOMES = [
  "Agenda",
  "Reagenda",
  "Seguimiento",
  "Venta",
  "No interesado",
  "No-show",
] as const;

export type CloserOutcome = (typeof CLOSER_OUTCOMES)[number];
export type CloserOutcomeFilter = "all" | "none" | CloserOutcome;

function getLatestCloserOutcome(
  questions: readonly AgendaQuestion[],
): CloserOutcome | null {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const question = questions[index];
    if (
      question?.authorRole === "closer" &&
      question.questionKey === "closerOutcome" &&
      CLOSER_OUTCOMES.includes(question.answer as CloserOutcome)
    ) {
      return question.answer as CloserOutcome;
    }
  }

  return null;
}

export function getLatestCallerQuestionAnswer(
  questions: readonly AgendaQuestion[],
  questionKey: string,
): string | undefined {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const question = questions[index];
    if (
      question?.authorRole === "caller" &&
      question.questionKey === questionKey
    ) {
      return question.answer;
    }
  }

  return undefined;
}

export function getLatestAgendaQuestionAnswer(
  questions: readonly AgendaQuestion[],
  questionKey: string,
): string | undefined {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const question = questions[index];
    if (question?.questionKey === questionKey) return question.answer;
  }

  return undefined;
}

export function filterAgendaLeads(
  leads: readonly AgendaLeadInput[],
): AgendaLead[] {
  return leads.flatMap((lead) => {
    const outcome = getLatestCallerQuestionAnswer(
      lead.questions,
      "callerOutcome",
    );
    if (outcome !== "Agenda") return [];

    return [
      {
        ...lead,
        scheduledDate:
          getLatestAgendaQuestionAnswer(lead.questions, "scheduledDate") ??
          "Sin asignar",
        scheduledTime:
          getLatestAgendaQuestionAnswer(lead.questions, "scheduledTime") ??
          "Sin asignar",
        closerOutcome: getLatestCloserOutcome(lead.questions),
      },
    ];
  });
}

export function filterAgendaLeadsByCloserOutcome(
  leads: readonly AgendaLead[],
  outcome: CloserOutcomeFilter,
): AgendaLead[] {
  if (outcome === "all") return [...leads];
  if (outcome === "none") {
    return leads.filter((lead) => lead.closerOutcome === null);
  }
  return leads.filter((lead) => lead.closerOutcome === outcome);
}

export function filterAgendaLeadsByCloser(
  leads: readonly AgendaLead[],
  closerId: string,
): AgendaLead[] {
  if (closerId === "all") return [...leads];

  return leads.filter((lead) => lead.closer?.id === closerId);
}

export function filterAgendaLeadsByDateRange(
  leads: readonly AgendaLead[],
  from: string,
  to: string,
): AgendaLead[] {
  if (!from && !to) return [...leads];

  return leads.filter(
    (lead) =>
      lead.scheduledDate !== "Sin asignar" &&
      (!from || lead.scheduledDate >= from) &&
      (!to || lead.scheduledDate <= to),
  );
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getAgendaClosers(
  leads: readonly AgendaLead[],
): AgendaCloser[] {
  const closers = new Map<string, AgendaCloser>();

  for (const lead of leads) {
    if (lead.closer) closers.set(lead.closer.id, lead.closer);
  }

  return [...closers.values()].sort((first, second) =>
    first.name.localeCompare(second.name),
  );
}
