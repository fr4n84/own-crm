export const CLOSER_OUTCOMES = [
  "Agenda",
  "Reagenda",
  "Seguimiento",
  "Venta",
  "No interesado",
  "No-show",
] as const;

export type CloserOutcome = (typeof CLOSER_OUTCOMES)[number];

export function isCloserOutcome(value: string | undefined): value is CloserOutcome {
  return Boolean(value && CLOSER_OUTCOMES.includes(value as CloserOutcome));
}

type FeedbackQuestion = { authorRole: "caller" | "closer"; questionKey?: string; answer: string };

export function canOpenCloserFeedback(questions: readonly FeedbackQuestion[]) {
  return questions.some((item) => item.authorRole === "closer" || (
    item.authorRole === "caller" && item.questionKey === "callerOutcome" && item.answer === "Agenda"
  ));
}
