import { describe, expect, it } from "vitest";

import { canOpenCloserFeedback, isCloserOutcome } from "./closer-answer-policy";

describe("closer answer policy", () => {
  it("keeps a structured agenda outcome mandatory", () => {
    expect(isCloserOutcome("Venta")).toBe(true);
    expect(isCloserOutcome("Seguimiento")).toBe(true);
    expect(isCloserOutcome(undefined)).toBe(false);
    expect(isCloserOutcome("texto libre")).toBe(false);
  });
});

it("opens closer feedback only for prior closer work or a caller appointment", () => {
  expect(canOpenCloserFeedback([])).toBe(false);
  expect(canOpenCloserFeedback([{ authorRole: "caller", questionKey: "callerOutcome", answer: "No interesado" }])).toBe(false);
  expect(canOpenCloserFeedback([{ authorRole: "caller", questionKey: "callerOutcome", answer: "Agenda" }])).toBe(true);
  expect(canOpenCloserFeedback([{ authorRole: "closer", questionKey: "closerOutcome", answer: "Venta" }])).toBe(true);
});
