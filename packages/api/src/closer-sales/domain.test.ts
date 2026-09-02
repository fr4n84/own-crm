import { describe, expect, it } from "vitest";

import { classifySaleEvidence } from "./domain";

const question = (questionKey: string, answer: string) => ({
  questionKey,
  question: questionKey,
  answer,
  authorRole: "closer" as const,
  authorId: null,
});

describe("closer sale evidence", () => {
  it("recognizes a legacy CSV sale as partial evidence", () => {
    expect(classifySaleEvidence({ feedback: " VENTA ", questions: [] })).toBe("legacy_partial");
    expect(classifySaleEvidence({
      feedback: "VENTA",
      questions: [question("closerOutcome", "Venta"), question("legacySaleEvidence", "feedback_csv")],
    })).toBe("legacy_partial");
  });

  it("recognizes a normal closer sale as confirmed evidence", () => {
    expect(classifySaleEvidence({
      feedback: "Seguimiento completado",
      questions: [question("closerOutcome", "Venta")],
    })).toBe("confirmed");
  });

  it("rejects leads without sale evidence", () => {
    expect(classifySaleEvidence({
      feedback: "No interesado",
      questions: [question("closerOutcome", "No interesado")],
    })).toBeNull();
  });
});
