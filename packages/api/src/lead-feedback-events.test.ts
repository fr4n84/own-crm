import { describe, expect, it } from "vitest";

import {
  getAuthoritativeFeedbackOutcome,
  isAuthoritativeCallerContact,
  isAuthoritativeCallerFeedback,
} from "./lead-feedback-events";

describe("authoritative lead feedback classification", () => {
  it("excludes administrative Q&A edits from feedback and contact outcomes", () => {
    const event = {
      kind: "caller_feedback",
      actorRole: "admin",
      description: "Se actualizaron las respuestas registradas del lead",
      metadata: {
        activitySource: "administrative_qa_edit",
        questions: [{ questionKey: "callerOutcome", answer: "Agenda" }],
      },
    };

    expect(getAuthoritativeFeedbackOutcome(event)).toBeNull();
    expect(isAuthoritativeCallerFeedback(event)).toBe(false);
    expect(isAuthoritativeCallerContact(event)).toBe(false);
  });

  it("keeps real no-contact attempts but never classifies them as contact", () => {
    const event = {
      kind: "caller_feedback",
      actorRole: "caller",
      description: "Lead no contactado",
      metadata: {},
    };

    expect(getAuthoritativeFeedbackOutcome(event)).toBe("Lead no contactado");
    expect(isAuthoritativeCallerFeedback(event)).toBe(true);
    expect(isAuthoritativeCallerContact(event)).toBe(false);
  });
});
