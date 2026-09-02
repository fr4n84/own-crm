import { describe, expect, it } from "vitest";

import {
  buildCallerQualityRanking,
  selectCallerQualityRanking,
  type CallerQualityLead,
} from "./caller-quality-ranking";

const start = new Date("2026-08-03T09:00:00.000Z");

function event(
  id: string,
  kind: string,
  minutesAfterAssignment: number,
  description: string | null,
  profile = "busca_ingreso_extra",
  actorRole: string | null = "caller",
): CallerQualityLead["events"][number] {
  return {
    id,
    kind,
    description,
    actorRole,
    occurredAt: new Date(start.getTime() + minutesAfterAssignment * 60_000),
    metadata: kind === "caller_feedback"
      ? {
          questions: [
            { questionKey: "primaryProfile", answer: profile },
          ],
        }
      : {},
  };
}

function lead(
  id: string,
  callerId: string,
  callerName: string,
  events: CallerQualityLead["events"],
): CallerQualityLead {
  return {
    id,
    name: `Lead ${id}`,
    email: `${id}@example.com`,
    phone: "600000000",
    type: "maestra",
    callerId,
    callerName,
    assignedAt: start,
    assignmentEndedAt: null,
    source: "Meta Ads",
    campaign: "Agosto",
    events,
  };
}

describe("buildCallerQualityRanking", () => {
  it("does not let an administrative edit inflate caller quality or profile breakdowns", () => {
    const administrative = event("admin-edit", "caller_feedback", 5, "Agenda", "latino_extranjero", "admin");
    administrative.metadata = { ...administrative.metadata, activitySource: "administrative_qa_edit" };
    const result = buildCallerQualityRanking([
      lead("admin-only", "caller-a", "Ana", [administrative]),
    ], 1);

    expect(result.ranked[0]).toMatchObject({
      callerId: "caller-a",
      contactedRate: 0,
      appointmentRate: 0,
      showRate: 0,
      saleRate: 0,
      averageFirstContactMinutes: null,
    });
    expect(result.ranked[0]?.breakdowns.profiles).toEqual([
      expect.objectContaining({ value: "Sin perfil", contactedRate: 0, appointmentRate: 0 }),
    ]);
    expect(result.ranked[0]?.breakdowns.profiles.some(({ value }) => value === "latino_extranjero")).toBe(false);
    expect(result.attemptAnalysis.overall.averageAttempts).toBe(0);
  });

  it("ranks callers against the expected result for the same lead mix", () => {
    const result = buildCallerQualityRanking([
      lead("a-sale", "caller-a", "Ana", [
        event("a1", "caller_feedback", 30, "Agenda"),
        event("a2", "appointment_scheduled", 31, null),
        event("a3", "closer_feedback", 120, "Venta"),
      ]),
      lead("a-appointment", "caller-a", "Ana", [
        event("a4", "caller_feedback", 60, "Agenda"),
        event("a5", "appointment_scheduled", 61, null),
      ]),
      lead("b-one", "caller-b", "Bruno", [
        event("b1", "caller_feedback", 10, "No interesado"),
      ]),
      lead("b-two", "caller-b", "Bruno", [
        event("b2", "caller_feedback", 20, "No interesado"),
      ]),
    ], 2);

    expect(result.minimumSampleSize).toBe(2);
    expect(result.ranked.map(({ callerId }) => callerId)).toEqual([
      "caller-a",
      "caller-b",
    ]);
    expect(result.ranked[0]).toMatchObject({
      rank: 1,
      callerName: "Ana",
      assigned: 2,
      contactedRate: 100,
      appointmentRate: 100,
      showRate: 50,
      saleRate: 50,
      averageFirstContactMinutes: 45,
    });
    expect(result.ranked[0]?.adjustedIndex).toBeGreaterThan(100);
    expect(result.ranked[1]?.adjustedIndex).toBeLessThan(100);
    expect(result.ranked[0]?.breakdowns.sources[0]).toMatchObject({
      value: "Meta Ads",
      assigned: 2,
      saleRate: 50,
    });
    expect(result.ranked[0]?.breakdowns.profiles[0]?.value).toBe("busca_ingreso_extra");
    expect(result.weekly[0]?.label).toBe("03 ago 2026");
    expect(result.monthly[0]?.label).toBe("ago 2026");
  });

  it("keeps callers below the minimum sample out of the ordered ranking", () => {
    const result = buildCallerQualityRanking([
      lead("one", "caller-a", "Ana", [
        event("a1", "caller_feedback", 30, "No interesado"),
      ]),
    ], 2);

    expect(result.ranked).toEqual([]);
    expect(result.insufficientSample).toMatchObject([
      { callerId: "caller-a", callerName: "Ana", assigned: 1 },
    ]);
  });

  it("does not attribute events that happened after the next assignment", () => {
    const reassignedAt = new Date(start.getTime() + 45 * 60_000);
    const result = buildCallerQualityRanking([
      {
        ...lead("reassigned", "caller-a", "Ana", [
          event("late", "caller_feedback", 60, "Agenda"),
          event("late-appointment", "appointment_scheduled", 61, null),
        ]),
        assignmentEndedAt: reassignedAt,
      },
    ], 1);

    expect(result.ranked[0]).toMatchObject({
      contactedRate: 0,
      appointmentRate: 0,
      averageFirstContactMinutes: null,
    });
  });

  it("preserves the global benchmark when only one caller is displayed", () => {
    const ranking = buildCallerQualityRanking([
      lead("a-sale", "caller-a", "Ana", [
        event("a1", "caller_feedback", 30, "Agenda"),
        event("a2", "appointment_scheduled", 31, null),
        event("a3", "closer_feedback", 120, "Venta"),
      ]),
      lead("b-one", "caller-b", "Bruno", [
        event("b1", "caller_feedback", 10, "No interesado"),
      ]),
    ], 1);
    const globalIndex = ranking.ranked.find(({ callerId }) => callerId === "caller-a")?.adjustedIndex;

    const selected = selectCallerQualityRanking(ranking, "caller-a");

    expect(selected.ranked).toMatchObject([
      { callerId: "caller-a", rank: 1, adjustedIndex: globalIndex },
    ]);
    expect(selected.weekly.every(({ callerId }) => callerId === "caller-a")).toBe(true);
    expect(selected.monthly.every(({ callerId }) => callerId === "caller-a")).toBe(true);
    expect(selected.speedAnalysis.overall.reduce((sum, bucket) => sum + bucket.assigned, 0))
      .toBe(1);
    expect(selected.speedAnalysis.callers.map(({ value }) => value)).toEqual(["caller-a"]);
    expect(selected.attemptAnalysis.overall.total).toBe(1);
    expect(selected.attemptAnalysis.callers.map(({ value }) => value)).toEqual(["caller-a"]);
  });

  it("groups speed-to-lead conversions into stable boundary buckets", () => {
    const result = buildCallerQualityRanking([
      lead("under-five", "caller-a", "Ana", [
        event("u1", "caller_feedback", 4.9, "Agenda", "parado_desempleado"),
        event("u2", "appointment_scheduled", 5, null),
        event("u3", "closer_feedback", 30, "Venta"),
      ]),
      lead("five", "caller-a", "Ana", [
        event("f1", "caller_feedback", 5, "Agenda"),
        event("f2", "appointment_scheduled", 6, null),
      ]),
      lead("fifteen", "caller-b", "Bruno", [
        event("q1", "caller_feedback", 15, "No interesado"),
      ]),
      lead("sixty", "caller-b", "Bruno", [
        event("s1", "caller_feedback", 60, "No interesado"),
      ]),
      lead("three-hours", "caller-b", "Bruno", [
        event("h1", "caller_feedback", 180, "No interesado"),
      ]),
      lead("day", "caller-b", "Bruno", [
        event("d1", "caller_feedback", 1_440, "No interesado"),
      ]),
      lead("not-contacted", "caller-b", "Bruno", [
        event("n1", "caller_feedback", 10, "Lead no contactado"),
      ]),
    ], 1);

    expect(result.speedAnalysis.overall).toMatchObject([
      { key: "under_15", assigned: 2, contactedRate: 100, appointmentRate: 100, saleRate: 50 },
      { key: "from_15_to_60", assigned: 1, contactedRate: 100 },
      { key: "from_1_to_3_hours", assigned: 1, contactedRate: 100 },
      { key: "from_3_to_24_hours", assigned: 1, contactedRate: 100 },
      { key: "over_24_hours", assigned: 1, contactedRate: 100 },
      { key: "not_contacted", assigned: 1, contactedRate: 0, averageFirstContactMinutes: null },
    ]);
    const ana = result.speedAnalysis.callers.find(({ value }) => value === "caller-a");
    expect(ana).toMatchObject({ value: "caller-a", label: "Ana", total: 2 });
    expect(ana?.buckets.filter(({ assigned }) => assigned > 0)).toMatchObject([
      { key: "under_15", assigned: 2 },
    ]);
    expect(result.speedAnalysis.profiles.some(({ value }) => value === "parado_desempleado"))
      .toBe(true);
    expect(result.speedAnalysis.sources[0]?.value).toBe("Meta Ads");
    expect(result.speedAnalysis.campaigns[0]?.value).toBe("Agosto");
  });

  it("analyzes contact attempts before success and incomplete follow-up", () => {
    const result = buildCallerQualityRanking([
      lead("zero-attempts", "caller-a", "Ana", []),
      lead("first-attempt", "caller-a", "Ana", [
        event("o1", "caller_feedback", 5, "Agenda"),
        event("o2", "appointment_scheduled", 6, null),
      ]),
      lead("second-attempt", "caller-a", "Ana", [
        event("t1", "caller_feedback", 5, "Lead no contactado"),
        event("t2", "caller_feedback", 20, "Agenda"),
        event("t3", "appointment_scheduled", 21, null),
      ]),
      lead("third-attempt", "caller-b", "Bruno", [
        event("h1", "caller_feedback", 5, "Lead no contactado"),
        event("h2", "caller_feedback", 10, "Lead no contactado"),
        event("h3", "caller_feedback", 25, "Agenda"),
        event("h4", "appointment_scheduled", 26, null),
        event("h5", "closer_feedback", 60, "Venta"),
      ]),
      lead("two-unsuccessful", "caller-b", "Bruno", [
        event("n1", "caller_feedback", 5, "Lead no contactado"),
        event("n2", "caller_feedback", 65, "Lead no contactado"),
      ]),
    ], 1);

    expect(result.attemptAnalysis.overall.buckets).toMatchObject([
      { key: "zero", assigned: 1, contactedRate: 0 },
      { key: "one", assigned: 1, contactedRate: 100, appointmentRate: 100 },
      { key: "two", assigned: 2, contactedRate: 50, appointmentRate: 50 },
      { key: "three", assigned: 1, contactedRate: 100, saleRate: 100 },
      { key: "four_plus", assigned: 0 },
    ]);
    expect(result.attemptAnalysis.overall).toMatchObject({
      total: 5,
      averageAttempts: 1.6,
      averageAttemptIntervalMinutes: 24,
      notContactedBelowThree: 2,
      notContactedBelowThreeRate: 40,
    });
    expect(result.attemptAnalysis.callers.find(({ value }) => value === "caller-a"))
      .toMatchObject({ value: "caller-a", label: "Ana", total: 3 });
    expect(result.attemptAnalysis.profiles.some(({ value }) => value === "Sin perfil")).toBe(true);
    expect(result.attemptAnalysis.sources[0]?.value).toBe("Meta Ads");
    expect(result.attemptAnalysis.campaigns[0]?.value).toBe("Agosto");
  });
});
