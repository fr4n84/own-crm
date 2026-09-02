export type CallerOutcome =
  | "future_call"
  | "not_fit"
  | "not_interested"
  | "appointment";

export type CallerOutcomeInput = {
  outcome: CallerOutcome;
  closerId?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  alertSeverity?: "urgent" | "warning" | "info";
};

export const OUTCOME_LABELS: Record<CallerOutcome, string> = {
  future_call: "Llamar a futuro",
  not_fit: "No encaja",
  not_interested: "No interesado",
  appointment: "Agenda",
};

type ExistingAppointmentQuestion = {
  questionKey: string;
  answer: string;
  authorRole: "caller" | "closer";
  authorId: string | null;
};

type AppointmentTrackingQuestion = {
  questionKey: string;
  question: string;
  answer: string;
};

type AppointmentHistoryEntry = {
  date: string;
  time: string;
};

function parseAppointmentHistory(
  answer: string | undefined,
): AppointmentHistoryEntry[] {
  if (!answer) return [];

  try {
    const value: unknown = JSON.parse(answer);
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

function getLatestAppointmentAnswer(
  questions: readonly ExistingAppointmentQuestion[],
  questionKey: string,
): string | undefined {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const question = questions[index];
    if (
      question?.questionKey === questionKey
    ) {
      return question.answer;
    }
  }

  return undefined;
}

export function buildAppointmentTrackingQuestions({
  existingQuestions,
  callerId: _callerId,
  scheduledDate,
  scheduledTime,
  changedAt,
}: {
  existingQuestions: readonly ExistingAppointmentQuestion[];
  callerId: string;
  scheduledDate: string;
  scheduledTime: string;
  changedAt: string;
}): AppointmentTrackingQuestion[] {
  const previousOutcome = getLatestAppointmentAnswer(
    existingQuestions,
    "callerOutcome",
  );
  const previousDate = getLatestAppointmentAnswer(
    existingQuestions,
    "scheduledDate",
  );
  const previousTime = getLatestAppointmentAnswer(
    existingQuestions,
    "scheduledTime",
  );
  const storedFirstDate = getLatestAppointmentAnswer(
    existingQuestions,
    "firstAppointmentDate",
  );
  const storedFirstTime = getLatestAppointmentAnswer(
    existingQuestions,
    "firstAppointmentTime",
  );
  const previousRescheduled =
    getLatestAppointmentAnswer(
      existingQuestions,
      "appointmentRescheduled",
    ) === "Si";
  const previousRescheduledAt = getLatestAppointmentAnswer(
    existingQuestions,
    "appointmentRescheduledAt",
  );
  const storedHistory = parseAppointmentHistory(
    getLatestAppointmentAnswer(
      existingQuestions,
      "appointmentHistory",
    ),
  );
  const hadAppointment = previousOutcome === "Agenda" || Boolean(storedFirstDate);
  const scheduleChanged =
    hadAppointment &&
    Boolean(previousDate && previousTime) &&
    (previousDate !== scheduledDate || previousTime !== scheduledTime);
  const isRescheduled = previousRescheduled || scheduleChanged;
  const firstDate = storedFirstDate ?? previousDate ?? scheduledDate;
  const firstTime = storedFirstTime ?? previousTime ?? scheduledTime;
  const appointmentHistory = [...storedHistory];

  if (
    appointmentHistory.length === 0 &&
    hadAppointment &&
    previousDate &&
    previousTime
  ) {
    appointmentHistory.push({ date: previousDate, time: previousTime });
  }

  const latestHistoryEntry = appointmentHistory.at(-1);
  if (
    !latestHistoryEntry ||
    latestHistoryEntry.date !== scheduledDate ||
    latestHistoryEntry.time !== scheduledTime
  ) {
    appointmentHistory.push({ date: scheduledDate, time: scheduledTime });
  }

  const trackingQuestions: AppointmentTrackingQuestion[] = [
    {
      questionKey: "firstAppointmentDate",
      question: "Fecha de la primera agenda",
      answer: firstDate,
    },
    {
      questionKey: "firstAppointmentTime",
      question: "Hora de la primera agenda",
      answer: firstTime,
    },
    {
      questionKey: "appointmentRescheduled",
      question: "¿Es una reagenda?",
      answer: isRescheduled ? "Si" : "No",
    },
  ];

  if (isRescheduled) {
    trackingQuestions.push({
      questionKey: "appointmentRescheduledAt",
      question: "Fecha de registro de la reagenda",
      answer: previousRescheduledAt ?? changedAt,
    });
  }

  trackingQuestions.push({
    questionKey: "appointmentHistory",
    question: "Historial de agenda",
    answer: JSON.stringify(appointmentHistory),
  });

  return trackingQuestions;
}

export function getScheduledAt(
  scheduledDate: string,
  scheduledTime: string,
): Date {
  return new Date(`${scheduledDate}T${scheduledTime}`);
}

export function validateCallerOutcomeInput(
  input: CallerOutcomeInput,
): Record<string, string> | undefined {
  const errors: Record<string, string> = {};

  if (input.outcome === "future_call" || input.outcome === "appointment") {
    if (!input.scheduledDate) errors.scheduledDate = "Required";
    if (!input.scheduledTime) errors.scheduledTime = "Required";

    if (input.scheduledDate && input.scheduledTime) {
      const scheduledAt = getScheduledAt(
        input.scheduledDate,
        input.scheduledTime,
      );
      if (Number.isNaN(scheduledAt.getTime())) {
        errors.scheduledDate = "Invalid date or time";
      } else if (scheduledAt.getTime() <= Date.now()) {
        errors.scheduledDate = "Must be in the future";
      }
    }
  }

  if (input.outcome === "future_call") {
    if (!input.alertSeverity) errors.alertSeverity = "Required";
  }

  if (input.outcome === "appointment" && !input.closerId) {
    errors.closerId = "Required";
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}
