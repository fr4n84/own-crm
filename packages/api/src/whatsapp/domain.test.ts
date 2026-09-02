import { describe, expect, it } from "vitest";

import { isWhatsappQueueLead, matchesWhatsappQueueStatus } from "./domain";

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
