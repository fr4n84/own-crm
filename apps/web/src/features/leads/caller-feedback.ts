import { OUTCOME_LABELS, type CallerOutcome } from "@crm-fran/api/caller-outcome";

export const CALLER_FEEDBACK_OPTIONS = (Object.entries(OUTCOME_LABELS) as Array<[CallerOutcome, string]>).map(
  ([value, label]) => ({ value, label }),
);

export type CallerFeedbackFilter = "all" | "none" | CallerOutcome;

type LeadQuestion = {
  questionKey?: string;
  question?: string;
  answer: string;
  authorRole: "caller" | "closer";
};

export function getCanonicalCallerFeedback(questions: readonly LeadQuestion[] | undefined): {
  value: CallerOutcome | null;
  label: string;
} {
  for (let index = (questions?.length ?? 0) - 1; index >= 0; index -= 1) {
    const question = questions?.[index];
    if (question?.authorRole !== "caller" || question.questionKey !== "callerOutcome") continue;
    const option = CALLER_FEEDBACK_OPTIONS.find(({ label }) => label === question.answer);
    return option ?? { value: null, label: "Sin feedback" };
  }
  return { value: null, label: "Sin feedback" };
}

export function matchesCallerFeedbackFilter(
  questions: readonly LeadQuestion[] | undefined,
  filter: CallerFeedbackFilter,
) {
  if (filter === "all") return true;
  const feedback = getCanonicalCallerFeedback(questions);
  return filter === "none" ? feedback.value === null : feedback.value === filter;
}
