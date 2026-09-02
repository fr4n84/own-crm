import { describe, expect, it } from "vitest";

import { buildAssignmentEpochObservations, collapseRecommendationLifecycle, selectOverdueFollowUpCommitment, withLegacyAssignmentFallback } from "./service";

const at = (value: string) => new Date(value);

describe("commercial intelligence service derivations", () => {
  it("synthesizes a legacy epoch only for the role missing immutable assignments", () => {
    const assignments = withLegacyAssignmentFallback({
      assignments: [{ role: "caller", userId: "caller-event", occurredAt: at("2026-08-01T09:00:00Z") }],
      callerId: "caller-current", closerId: "closer-current", createdAt: at("2026-08-01T08:00:00Z"),
    });
    expect(assignments).toEqual([
      { role: "caller", userId: "caller-event", occurredAt: at("2026-08-01T09:00:00Z") },
      { role: "closer", userId: "closer-current", occurredAt: at("2026-08-01T08:00:00Z") },
    ]);
  });

  it("selects the earliest active overdue commitment and never lets a future alert hide it", () => {
    const due = selectOverdueFollowUpCommitment({
      now: at("2026-08-03T12:00:00Z"),
      alerts: [
        { id: "future", kind: "future_call", nextShowAt: at("2026-08-04T10:00:00Z"), resolvedAt: null, dismissedAt: null, expiredAt: null },
        { id: "later-due", kind: "follow_up", nextShowAt: at("2026-08-02T10:00:00Z"), resolvedAt: null, dismissedAt: null, expiredAt: null },
        { id: "first-due", kind: "future_call", nextShowAt: at("2026-08-01T10:00:00Z"), resolvedAt: null, dismissedAt: null, expiredAt: null },
      ],
    });
    expect(due).toEqual(at("2026-08-01T10:00:00Z"));
  });

  it("keeps a zero-outcome assignment epoch in the conversion denominator", () => {
    const observations = buildAssignmentEpochObservations({
      assignments: [
        { role: "caller", userId: "successful", occurredAt: at("2026-08-01T09:00:00Z") },
        { role: "caller", userId: "zero", occurredAt: at("2026-08-01T10:00:00Z") },
      ],
      outcomes: [{ kind: "contacted", occurredAt: at("2026-08-01T09:15:00Z") }],
      from: at("2026-08-01T00:00:00Z"), to: at("2026-08-01T12:00:00Z"),
      segment: { profile: "A", source: "Meta", campaign: "C", type: "vsl" },
    });
    expect(observations.get("successful")?.[0]).toMatchObject({ contacted: true });
    expect(observations.get("zero")?.[0]).toMatchObject({ contacted: false });
  });

  it("collapses shown and terminal events by actor, lead and recommendation key", () => {
    const rows = collapseRecommendationLifecycle({
      now: at("2026-08-03T12:00:00Z"),
      events: [
        { id: "shown", leadId: "lead", actorId: "actor", kind: "recommendation_shown", occurredAt: at("2026-08-01T10:00:00Z"), metadata: { recommendationKey: "one", actionType: "no_contact" }, description: null },
        { id: "done", leadId: "lead", actorId: "actor", kind: "recommendation_completed", occurredAt: at("2026-08-01T11:00:00Z"), metadata: { recommendationKey: "one", actionType: "no_contact" }, description: null },
        { id: "idle", leadId: "lead", actorId: "actor", kind: "recommendation_shown", occurredAt: at("2026-08-01T10:00:00Z"), metadata: { recommendationKey: "two", actionType: "no_contact" }, description: null },
      ],
      outcomes: [], from: at("2026-08-01T00:00:00Z"), to: at("2026-08-03T12:00:00Z"),
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.state)).toEqual(["completed", "unworked"]);
  });

  it("credits a downstream outcome to only the latest shown lifecycle", () => {
    const rows = collapseRecommendationLifecycle({
      now: at("2026-08-02T12:00:00Z"),
      events: [
        { id: "first", leadId: "lead", actorId: "actor", kind: "recommendation_shown", occurredAt: at("2026-08-01T08:00:00Z"), metadata: { recommendationKey: "first", actionType: "no_contact" }, description: null },
        { id: "second", leadId: "lead", actorId: "actor", kind: "recommendation_shown", occurredAt: at("2026-08-01T09:00:00Z"), metadata: { recommendationKey: "second", actionType: "no_contact" }, description: null },
      ], outcomes: [{ kind: "contacted", occurredAt: at("2026-08-01T10:00:00Z") }], from: at("2026-08-01T00:00:00Z"), to: at("2026-08-02T12:00:00Z"),
    });
    expect(rows.find((row) => row.recommendationKey === "first")?.downstream.contacted).toBeUndefined();
    expect(rows.find((row) => row.recommendationKey === "second")?.downstream.contacted).toBe(true);
  });
});
