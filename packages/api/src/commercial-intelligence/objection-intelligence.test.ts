import { describe, expect, it } from "vitest";
import { buildObjectionMotivationIntelligence } from "./objection-intelligence";

describe("objection and motivation intelligence", () => {
  it("uses historical attribution at feedback time and exposes no transcript", () => {
    const result = buildObjectionMotivationIntelligence({
      activities: [
        { id: "created", leadId: "lead-1", actorId: null, kind: "lead_created", occurredAt: new Date("2026-01-01"), metadata: { source: "Meta", campaign: "Old", ad: "A" } },
        { id: "changed", leadId: "lead-1", actorId: "admin", kind: "lead_attribution_updated", occurredAt: new Date("2026-01-02"), metadata: { after: { source: "Meta", campaign: "New", ad: "B", creative: null, acquisitionAngle: null } } },
        { id: "feedback", leadId: "lead-1", actorId: "caller-1", kind: "caller_feedback", occurredAt: new Date("2026-01-03"), metadata: { questions: [
          { questionKey: "objectionTypes", answer: '["price"]' },
          { questionKey: "motivationAngles", answer: '["financial_stability"]' },
          { questionKey: "extraInfo", answer: "private transcript" },
        ] } },
      ],
      outcomes: [{ leadId: "lead-1", kind: "sale", occurredAt: new Date("2026-01-04") }],
      actorId: null,
    });
    expect(result.objections[0]).toMatchObject({ value: "price", campaign: "New", ad: "B", leads: 1, sales: 1 });
    expect(JSON.stringify(result)).not.toContain("private transcript");
  });

  it("scopes callers to their own feedback and tags missing buckets", () => {
    const result = buildObjectionMotivationIntelligence({
      activities: [
        { id: "f1", leadId: "lead-1", actorId: "caller-1", kind: "caller_feedback", occurredAt: new Date(), metadata: { questions: [{ questionKey: "objectionTypes", answer: '["price"]' }] } },
        { id: "f2", leadId: "lead-2", actorId: "caller-2", kind: "caller_feedback", occurredAt: new Date(), metadata: { questions: [{ questionKey: "objectionTypes", answer: '["timing"]' }] } },
      ], outcomes: [], actorId: "caller-1",
    });
    expect(result.objections).toHaveLength(1);
    expect(result.objections[0]?.sourceIdentity).toEqual({ missing: true });
  });
});
