export type AlertTypeFilter =
  | "all"
  | "no_contact"
  | "follow_up"
  | "appointment"
  | "future_call"
  | "rescheduled";

export const ALERT_TYPE_LABELS: Record<Exclude<AlertTypeFilter, "all">, string> = {
  no_contact: "Sin contacto",
  follow_up: "Seguimiento",
  appointment: "Agenda",
  future_call: "Llamar futuro",
  rescheduled: "Reagenda",
};

type AlertQuestion = {
  questionKey: string;
  answer: string;
  authorRole: "caller" | "closer";
};

type AlertWithType = {
  kind: string;
  message: string;
  lead: { questions: readonly AlertQuestion[] } | null;
};

function getLatestAnswer(
  questions: readonly AlertQuestion[],
  questionKey: string,
): string | undefined {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const question = questions[index];
    if (question?.questionKey === questionKey) {
      return question.answer;
    }
  }

  return undefined;
}

export function getAlertType(
  alert: AlertWithType,
): Exclude<AlertTypeFilter, "all"> | undefined {
  if (alert.message === "Llamar a futuro") {
    return "future_call";
  }

  if (
    alert.kind === "no_contact" ||
    alert.kind === "follow_up" ||
    alert.kind === "appointment" ||
    alert.kind === "future_call" ||
    alert.kind === "rescheduled"
  ) {
    return alert.kind;
  }

  return undefined;
}

export function filterAlertsByType<T extends AlertWithType>(
  alerts: readonly T[],
  typeFilter: AlertTypeFilter,
): T[] {
  if (typeFilter === "all") {
    return [...alerts];
  }

  return alerts.filter((alert) => getAlertType(alert) === typeFilter);
}

export type AppointmentHistoryEntry = {
  date: string;
  time: string;
};

export function getAppointmentHistory(
  alert: AlertWithType | undefined,
): AppointmentHistoryEntry[] {
  if (!alert?.lead || getAlertType(alert) !== "rescheduled") {
    return [];
  }

  const history = getLatestAnswer(
    alert.lead.questions,
    "appointmentHistory",
  );
  if (!history) return [];

  try {
    const value: unknown = JSON.parse(history);
    if (!Array.isArray(value)) return [];

    return value.filter(
      (entry): entry is AppointmentHistoryEntry =>
        typeof entry === "object" &&
        entry !== null &&
        "date" in entry &&
        typeof entry.date === "string" &&
        "time" in entry &&
        typeof entry.time === "string",
    );
  } catch {
    return [];
  }
}
