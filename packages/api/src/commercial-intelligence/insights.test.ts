import { describe, expect, it } from "vitest";

import { buildCommercialIntelligence } from "./insights";

const at = (value: string) => new Date(value);

describe("commercial intelligence", () => {
  it("ranks different candidates for different segments and shrinks sparse performance with 30 observations", () => {
    const result = buildCommercialIntelligence({
      now: at("2026-08-23T12:00:00.000Z"),
      leads: [
        { id: "meta", profile: "A", source: "Meta", campaign: "C1", type: "vsl", createdAt: at("2026-08-23T09:00:00.000Z"), assignments: [], outcomes: [] },
        { id: "google", profile: "B", source: "Google", campaign: "C2", type: "maestra", createdAt: at("2026-08-23T09:00:00.000Z"), assignments: [], outcomes: [] },
      ],
      people: [
        { id: "sparse", name: "Sparse", role: "caller", workload: 0, capacity: 10, observations: [{ profile: "A", source: "Meta", campaign: "C1", type: "vsl", timeBucket: "morning", contacted: true, assignmentToContactMinutes: 1 }] },
        { id: "meta-caller", name: "Meta caller", role: "caller", workload: 1, capacity: 10, observations: Array.from({ length: 30 }, () => ({ profile: "A", source: "Meta", campaign: "C1", type: "vsl", timeBucket: "morning", contacted: true, assignmentToContactMinutes: 5 })) },
        { id: "google-caller", name: "Google caller", role: "caller", workload: 1, capacity: 10, observations: Array.from({ length: 30 }, () => ({ profile: "B", source: "Google", campaign: "C2", type: "maestra", timeBucket: "morning", contacted: true, assignmentToContactMinutes: 5 })) },
        { id: "meta-closer", name: "Meta closer", role: "closer", workload: 1, capacity: 10, observations: Array.from({ length: 30 }, () => ({ profile: "A", source: "Meta", campaign: "C1", type: "vsl", timeBucket: "morning", sale: true })) },
        { id: "google-closer", name: "Google closer", role: "closer", workload: 1, capacity: 10, observations: Array.from({ length: 30 }, () => ({ profile: "B", source: "Google", campaign: "C2", type: "maestra", timeBucket: "morning", sale: true })) },
      ],
      recommendations: [],
    });

    expect(result.assignments).toMatchObject([
      { leadId: "meta", bestCallerId: "meta-caller", bestCloserId: "meta-closer", simulationOnly: true },
      { leadId: "google", bestCallerId: "google-caller", bestCloserId: "google-closer", simulationOnly: true },
    ]);
    expect(result.assignments[0]?.caller?.sampleSize).toBe(30);
    expect(result.assignments[0]?.caller?.fallbackLevel).toBe("exact");
    expect(result.assignments[0]?.reasons.join(" ")).toContain("muestra");
  });

  it("learns only downstream outcomes after each recommendation and keeps the adjustment observational", () => {
    const result = buildCommercialIntelligence({
      now: at("2026-08-23T12:00:00.000Z"),
      leads: [], people: [],
      recommendations: [
        { recommendationKey: "before", actionType: "no_contact", state: "completed", profile: "A", source: "Meta", campaign: "C1", callerId: "caller", occurredAt: at("2026-08-23T10:00:00.000Z"), downstream: { contacted: true, appointment: true, show: true, sale: true } },
        { recommendationKey: "after", actionType: "no_contact", state: "skipped", profile: "A", source: "Meta", campaign: "C1", callerId: "caller", occurredAt: at("2026-08-23T11:00:00.000Z"), downstream: { contacted: false, appointment: false, show: false, sale: false } },
      ],
    });
    expect(result.learning[0]).toMatchObject({ actionType: "no_contact", shown: 2, completed: 1, skipped: 1, contactedRate: 50, saleRate: 50, sampleSize: 2, adjustmentMode: "shadow" });
    expect(result.learning[0]?.note).toContain("no implica causalidad");
  });

  it("uses assignment epochs for leakage categories and distinguishes null revenue from zero", () => {
    const input = {
      now: at("2026-08-23T12:00:00.000Z"), people: [{ id: "caller", name: "Caller", role: "caller" as const, workload: 12, capacity: 10, observations: [] }], recommendations: [],
      leads: [
        { id: "slow", profile: null, source: null, campaign: null, type: "vsl" as const, createdAt: at("2026-08-23T08:00:00.000Z"), assignments: [{ role: "caller" as const, userId: "caller", occurredAt: at("2026-08-23T08:00:00.000Z") }], outcomes: [] },
        { id: "no-show", profile: null, source: null, campaign: null, type: "vsl" as const, createdAt: at("2026-08-23T08:00:00.000Z"), assignments: [], scheduledAt: at("2026-08-23T09:00:00.000Z"), appointmentConfirmed: true, outcomes: [] },
        { id: "stalled", profile: null, source: null, campaign: null, type: "vsl" as const, createdAt: at("2026-08-20T08:00:00.000Z"), assignments: [], followUpDueAt: at("2026-08-22T08:00:00.000Z"), outcomes: [] },
        { id: "mismatch", profile: null, source: null, campaign: null, type: "vsl" as const, createdAt: at("2026-08-23T08:00:00.000Z"), assignments: [{ role: "caller" as const, userId: "caller", occurredAt: at("2026-08-23T08:00:00.000Z") }], simulatedCallerId: "other", outcomes: [{ kind: "contacted" as const, occurredAt: at("2026-08-23T08:30:00.000Z") }] },
      ],
    };
    const withoutRevenue = buildCommercialIntelligence(input);
    const withZero = buildCommercialIntelligence({ ...input, referenceSaleValue: 0 });
    expect(withoutRevenue.leakage.map((item) => item.count)).toEqual([1, 0, 0, 1, 1, 1]);
    expect(withoutRevenue.leakage.every((item) => item.estimatedRevenue === null)).toBe(true);
    expect(withZero.leakage.every((item) => item.estimatedRevenue === 0)).toBe(true);
  });

  it("counts collapsed recommendation lifecycles once and never treats terminal items as unworked", () => {
    const result = buildCommercialIntelligence({
      now: at("2026-08-23T12:00:00.000Z"), leads: [], people: [],
      recommendations: [
        { recommendationKey: "done", actionType: "no_contact", state: "completed", profile: null, source: null, campaign: null, callerId: null, occurredAt: at("2026-08-20T10:00:00.000Z"), downstream: {} },
        { recommendationKey: "skip", actionType: "no_contact", state: "skipped", profile: null, source: null, campaign: null, callerId: null, occurredAt: at("2026-08-20T10:00:00.000Z"), downstream: {} },
        { recommendationKey: "idle", actionType: "no_contact", state: "unworked", profile: null, source: null, campaign: null, callerId: null, occurredAt: at("2026-08-20T10:00:00.000Z"), downstream: {} },
      ],
    });
    expect(result.learning[0]).toMatchObject({ shown: 3, completed: 1, skipped: 1, sampleSize: 3 });
    expect(result.leakage.find((item) => item.key === "unworked_recommendation")?.count).toBe(1);
  });

  it("does not invent a stalled follow-up without a real due commitment", () => {
    const base = { now: at("2026-08-23T12:00:00.000Z"), people: [], recommendations: [] };
    const noCommitment = buildCommercialIntelligence({ ...base, leads: [{ id: "none", profile: null, source: null, campaign: null, type: "vsl", createdAt: at("2026-08-20T10:00:00.000Z"), assignments: [], outcomes: [] }] });
    const overdue = buildCommercialIntelligence({ ...base, leads: [{ id: "due", profile: null, source: null, campaign: null, type: "vsl", createdAt: at("2026-08-20T10:00:00.000Z"), assignments: [], outcomes: [], followUpDueAt: at("2026-08-21T10:00:00.000Z") }] });
    expect(noCommitment.leakage.find((item) => item.key === "stalled_follow_up")?.count).toBe(0);
    expect(overdue.leakage.find((item) => item.key === "stalled_follow_up")?.count).toBe(1);
  });
});
