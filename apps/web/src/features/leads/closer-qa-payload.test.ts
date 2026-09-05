import { describe, expect, it } from "vitest";

import { buildPayload, validateCloserAnswers } from "./closer-qa-form";

const optionalBlankAnswers = {
  isContacted: "Si",
  isDecisionMaker: "",
  decisionMakerName: "",
  financialSource: "",
  productFit: "",
  urgencyReason: "",
  extraInfo: "",
  closerOutcome: "Venta",
  closerFeedback: "Venta cerrada",
  scheduledDate: "",
  scheduledTime: "",
} as const;

describe("closer feedback payload", () => {
  it("requires only the outcome and omits blank optional questions", () => {
    expect(validateCloserAnswers(optionalBlankAnswers)).toBeUndefined();
    expect(buildPayload("lead-1", optionalBlankAnswers)).toMatchObject({
      questions: [
        expect.objectContaining({ questionKey: "isContacted", answer: "Si" }),
        expect.objectContaining({ questionKey: "closerOutcome", answer: "Venta" }),
        expect.objectContaining({ questionKey: "closerFeedback", answer: "Venta cerrada" }),
      ],
    });
    expect(buildPayload("lead-1", optionalBlankAnswers).questions.every(({ answer }) => answer.trim() !== "")).toBe(true);
  });

  it("keeps date and time mandatory only for scheduled outcomes", () => {
    expect(validateCloserAnswers({ ...optionalBlankAnswers, closerOutcome: "Seguimiento" })).toMatchObject({
      fields: { scheduledDate: ["Requerido"], scheduledTime: ["Requerido"] },
    });
    expect(validateCloserAnswers({ ...optionalBlankAnswers, closerOutcome: "Reagenda" })).toMatchObject({
      fields: { scheduledDate: ["Requerido"], scheduledTime: ["Requerido"] },
    });
  });
});
