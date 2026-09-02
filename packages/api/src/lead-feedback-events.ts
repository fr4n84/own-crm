export const LEAD_FEEDBACK_ACTIVITY_SOURCE = {
  ADMINISTRATIVE_QA_EDIT: "administrative_qa_edit",
} as const;

type FeedbackEvent = {
  kind: string;
  actorRole?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

function questionOutcome(metadata: Record<string, unknown> | null | undefined) {
  const questions = metadata?.questions;
  if (!Array.isArray(questions)) return null;
  const item = [...questions].reverse().find((question): question is { questionKey: string; answer: string } => (
    typeof question === "object"
    && question !== null
    && "questionKey" in question
    && (question.questionKey === "callerOutcome" || question.questionKey === "closerOutcome")
    && "answer" in question
    && typeof question.answer === "string"
  ));
  return item?.answer.trim() || null;
}

export function isAdministrativeFeedbackEvent(event: FeedbackEvent) {
  return event.actorRole === "admin"
    || event.metadata?.activitySource === LEAD_FEEDBACK_ACTIVITY_SOURCE.ADMINISTRATIVE_QA_EDIT;
}

export function getAuthoritativeFeedbackOutcome(event: FeedbackEvent) {
  if ((event.kind !== "caller_feedback" && event.kind !== "closer_feedback") || isAdministrativeFeedbackEvent(event)) return null;
  return event.description?.trim() || questionOutcome(event.metadata);
}

export function isAuthoritativeCallerFeedback(event: FeedbackEvent) {
  return event.kind === "caller_feedback" && !isAdministrativeFeedbackEvent(event);
}

export function isAuthoritativeCallerContact(event: FeedbackEvent) {
  if (!isAuthoritativeCallerFeedback(event)) return false;
  const outcome = getAuthoritativeFeedbackOutcome(event);
  return outcome !== null && outcome !== "Lead no contactado";
}
