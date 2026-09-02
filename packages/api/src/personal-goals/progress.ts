import type { PersonalGoalMetric } from "@crm-fran/db/schema/index";

type GoalActivity = {
  leadId: string;
  actorId: string | null;
  kind: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

type GoalStatus = "upcoming" | "active" | "completed";

const ATTENDED_OUTCOMES = new Set([
  "Agenda",
  "Reagenda",
  "Seguimiento",
  "Venta",
  "No interesado",
]);

function endOfDay(date: string) {
  return new Date(`${date}T23:59:59.999`);
}

function startOfDay(date: string) {
  return new Date(`${date}T00:00:00.000`);
}

function getAnswer(event: GoalActivity, questionKey: string) {
  const questions = event.metadata.questions;
  if (!Array.isArray(questions)) return undefined;
  const question = questions.find(
    (item): item is { questionKey: string; answer: string } =>
      typeof item === "object" &&
      item !== null &&
      "questionKey" in item &&
      "answer" in item &&
      item.questionKey === questionKey &&
      typeof item.answer === "string",
  );
  return question?.answer;
}

function uniqueLeadCount(events: readonly GoalActivity[]) {
  return new Set(events.map((event) => event.leadId)).size;
}

export function calculateGoalProgress({
  events,
  userId,
  metric,
  startDate,
  endDate,
}: {
  events: readonly GoalActivity[];
  userId: string;
  metric: PersonalGoalMetric;
  startDate: string;
  endDate: string;
}) {
  const from = startOfDay(startDate);
  const to = endOfDay(endDate);
  const inInterval = events.filter(
    (event) => event.occurredAt >= from && event.occurredAt <= to,
  );
  const own = inInterval.filter((event) => event.actorId === userId);
  const contacted = own.filter(
    (event) =>
      event.kind === "caller_feedback" &&
      getAnswer(event, "isContacted") === "Si",
  );
  const appointments = own.filter(
    (event) => event.kind === "appointment_scheduled",
  );

  if (metric === "assigned") {
    return uniqueLeadCount(own.filter((event) => event.kind === "caller_assigned"));
  }
  if (metric === "contacted") return uniqueLeadCount(contacted);
  if (metric === "appointments") return uniqueLeadCount(appointments);
  if (metric === "future_calls") {
    return uniqueLeadCount(
      contacted.filter(
        (event) => getAnswer(event, "callerOutcome") === "Llamar a futuro",
      ),
    );
  }
  if (metric === "appointment_rate") {
    const contactedCount = uniqueLeadCount(contacted);
    return contactedCount === 0
      ? 0
      : Math.round((uniqueLeadCount(appointments) / contactedCount) * 100);
  }

  const attended = inInterval.filter(
    (event) =>
      event.kind === "closer_feedback" &&
      ATTENDED_OUTCOMES.has(getAnswer(event, "closerOutcome") ?? ""),
  );
  const creditedShows = attended.filter((show) => {
    if (show.actorId === userId) return true;
    const latestAppointment = events
      .filter(
        (event) =>
        event.leadId === show.leadId &&
        event.kind === "appointment_scheduled" &&
          event.occurredAt <= show.occurredAt,
      )
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0];
    return latestAppointment?.actorId === userId;
  });
  return uniqueLeadCount(creditedShows);
}

export function getGoalStatus(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): GoalStatus {
  if (now < startOfDay(startDate)) return "upcoming";
  if (now > endOfDay(endDate)) return "completed";
  return "active";
}
