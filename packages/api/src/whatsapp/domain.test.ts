import { describe, expect, it } from "vitest";

import {
  canApproveWhatsappMessage,
  canTransitionWhatsappOutbox,
  hasCurrentWhatsappConsent,
  isWhatsappQueueLead,
  matchesWhatsappQueueStatus,
} from "./domain";

describe("WhatsApp queue eligibility", () => {
  it("includes discarded leads after three unsuccessful impacts", () => {
    expect(isWhatsappQueueLead({
      noContactImpactCount: 3,
      poolStatus: "discarded",
      state: "Asignado",
    })).toBe(true);
  });

  it("excludes wrong numbers and leads that have not exhausted three impacts", () => {
    expect(isWhatsappQueueLead({
      noContactImpactCount: 3,
      poolStatus: "discarded",
      state: "número erróneo",
    })).toBe(false);
    expect(isWhatsappQueueLead({
      noContactImpactCount: 2,
      poolStatus: "discarded",
      state: "Asignado",
    })).toBe(false);
  });

  it("separates pending and sent rows using only the sent timestamp", () => {
    expect(matchesWhatsappQueueStatus(null, "pending")).toBe(true);
    expect(matchesWhatsappQueueStatus(new Date(), "pending")).toBe(false);
    expect(matchesWhatsappQueueStatus(new Date(), "sent")).toBe(true);
  });
});

describe("WhatsApp outbox safeguards", () => {
  it("requires granted consent for the lead's current normalized phone and version", () => {
    const consent = {
      id: "consent-1",
      leadId: "lead-1",
      normalizedPhone: "+34600000000",
      status: "granted" as const,
      version: 2,
    };

    expect(hasCurrentWhatsappConsent({
      leadId: "lead-1",
      normalizedPhone: "+34600000000",
      consent,
    })).toBe(true);
    expect(hasCurrentWhatsappConsent({
      leadId: "lead-1",
      normalizedPhone: "+34600000001",
      consent,
    })).toBe(false);
    expect(hasCurrentWhatsappConsent({
      leadId: "lead-1",
      normalizedPhone: "+34600000000",
      consent: { ...consent, status: "revoked" },
    })).toBe(false);
  });

  it("allows only the explicit human approval and cancellation transitions", () => {
    expect(canTransitionWhatsappOutbox("pending_approval", "approved")).toBe(true);
    expect(canTransitionWhatsappOutbox("pending_approval", "cancelled")).toBe(true);
    expect(canTransitionWhatsappOutbox("approved", "pending_approval")).toBe(false);
    expect(canTransitionWhatsappOutbox("approved", "sent")).toBe(false);
  });

  it("requires a different human to approve the prepared message", () => {
    expect(canApproveWhatsappMessage({ creatorId: "user-1", approverId: "user-1" })).toBe(false);
    expect(canApproveWhatsappMessage({ creatorId: "user-1", approverId: "user-2" })).toBe(true);
  });
});
