import type { LeadQASession } from "@crm-fran/db/schema/index";

export type SaleEvidence = "confirmed" | "legacy_partial";

function latestAnswer(questions: LeadQASession, key: string) {
  return [...questions].reverse().find((question) => question.questionKey === key)?.answer;
}

export function classifySaleEvidence(input: {
  feedback: string;
  questions: LeadQASession;
}): SaleEvidence | null {
  const closerOutcome = latestAnswer(input.questions, "closerOutcome");
  const legacyMarker = latestAnswer(input.questions, "legacySaleEvidence");
  if (closerOutcome === "Venta") {
    return legacyMarker ? "legacy_partial" : "confirmed";
  }
  return input.feedback.trim().toLocaleLowerCase("es") === "venta"
    ? "legacy_partial"
    : null;
}
