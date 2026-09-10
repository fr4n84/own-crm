import { describe, expect, it } from "vitest";

import {
  assertAuthorityChangeOrder,
  buildEmailAudienceSnapshot,
  canUseCampaignForDelivery,
  type EmailAudienceCandidate,
} from "./domain";

const granted = {
  id: "permission-1",
  status: "granted" as const,
  source: "checkout",
  evidence: { reference: "order-1" },
  occurredAt: new Date("2026-09-01T10:00:00.000Z"),
  version: 1,
};

function candidate(overrides: Partial<EmailAudienceCandidate> = {}): EmailAudienceCandidate {
  return {
    leadId: "lead-1",
    leadName: "Ana",
    normalizedEmail: "ana@example.com",
    permission: granted,
    suppression: null,
    ...overrides,
  };
}

describe("email marketing audience policy", () => {
  it("never infers consent from an email or lead record", () => {
    const result = buildEmailAudienceSnapshot([candidate({ permission: null })]);
    expect(result.members).toEqual([
      expect.objectContaining({ decision: "excluded", reason: "no_active_consent" }),
    ]);
    expect(result.includedCount).toBe(0);
  });

  it("lets suppression win even when consent is active", () => {
    const result = buildEmailAudienceSnapshot([
      candidate({
        suppression: {
          id: "suppression-1",
          active: true,
          reason: "unsubscribe",
          source: "admin",
          evidence: { reference: "request-1" },
          occurredAt: new Date("2026-09-02T10:00:00.000Z"),
          version: 1,
        },
      }),
    ]);
    expect(result.members[0]).toMatchObject({ decision: "excluded", reason: "suppressed" });
  });

  it("produces the same immutable snapshot regardless of input order", () => {
    const duplicate = candidate({ leadId: "lead-2", leadName: "Duplicate" });
    const missing = candidate({ leadId: "lead-3", normalizedEmail: null, permission: null });
    const first = buildEmailAudienceSnapshot([duplicate, missing, candidate()]);
    const second = buildEmailAudienceSnapshot([candidate(), duplicate, missing]);
    expect(second).toEqual(first);
    expect(first.members).toEqual([
      expect.objectContaining({ leadId: "lead-1", decision: "included", reason: "eligible" }),
      expect.objectContaining({ leadId: "lead-2", decision: "excluded", reason: "duplicate_normalized_email" }),
      expect.objectContaining({ leadId: "lead-3", decision: "excluded", reason: "missing_normalized_email" }),
    ]);
    expect(Object.isFrozen(first.members)).toBe(true);
    expect(Object.isFrozen(first.members[0])).toBe(true);
  });


  it("rejects stale evidence from overwriting a newer authority decision", () => {
    expect(() => assertAuthorityChangeOrder({
      currentOccurredAt: new Date("2026-09-09T10:00:00.000Z"),
      nextOccurredAt: new Date("2026-09-08T10:00:00.000Z"),
    })).toThrow("older");
  });
  it("requires a ready campaign, an approved human copy, and an eligible snapshot", () => {
    expect(canUseCampaignForDelivery({ campaignStatus: "draft", copyStatus: "approved", includedCount: 1 })).toBe(false);
    expect(canUseCampaignForDelivery({ campaignStatus: "ready", copyStatus: "draft", includedCount: 1 })).toBe(false);
    expect(canUseCampaignForDelivery({ campaignStatus: "ready", copyStatus: "approved", includedCount: 0 })).toBe(false);
    expect(canUseCampaignForDelivery({ campaignStatus: "ready", copyStatus: "approved", includedCount: 1 })).toBe(true);
  });
});

