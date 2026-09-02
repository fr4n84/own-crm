import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { getCanonicalCallerFeedback, matchesCallerFeedbackFilter } from "./caller-feedback";

describe("canonical caller feedback", () => {
  it("maps the Feedback column through the canonical helper instead of the legacy free-text field", () => {
    const columns = readFileSync("src/features/table/columns.tsx", "utf8");
    expect(columns).toContain("getCanonicalCallerFeedback(row.original.questions)");
    expect(columns).not.toContain("row.original.feedback");
  });
  it("uses only the structured callerOutcome answer and exposes its readable label", () => {
    expect(getCanonicalCallerFeedback([
      { questionKey: "extraInfo", question: "Información extra", answer: "Agenda", authorRole: "caller" },
      { questionKey: "callerOutcome", question: "¿Qué ha sucedido?", answer: "No encaja", authorRole: "caller" },
    ])).toEqual({ value: "not_fit", label: "No encaja" });
  });

  it("does not reinterpret free text, transcripts, closer feedback, or unknown values", () => {
    expect(getCanonicalCallerFeedback([
      { questionKey: "transcript", question: "Transcripción", answer: "Agenda", authorRole: "caller" },
      { questionKey: "closerOutcome", question: "¿Qué ha ocurrido?", answer: "Venta", authorRole: "closer" },
      { questionKey: "callerOutcome", question: "¿Qué ha sucedido?", answer: "Texto libre", authorRole: "caller" },
    ])).toEqual({ value: null, label: "Sin feedback" });
  });

  it("filters independently by canonical value, all, and missing feedback", () => {
    const agenda = [{ questionKey: "callerOutcome", question: "¿Qué ha sucedido?", answer: "Agenda", authorRole: "caller" as const }];
    const none = [{ questionKey: "extraInfo", question: "Notas", answer: "Agenda", authorRole: "caller" as const }];
    expect(matchesCallerFeedbackFilter(agenda, "all")).toBe(true);
    expect(matchesCallerFeedbackFilter(agenda, "appointment")).toBe(true);
    expect(matchesCallerFeedbackFilter(agenda, "not_fit")).toBe(false);
    expect(matchesCallerFeedbackFilter(none, "none")).toBe(true);
  });
});
