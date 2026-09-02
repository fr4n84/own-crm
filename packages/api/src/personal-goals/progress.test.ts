import { describe, expect, it } from "vitest";

import { calculateGoalProgress, getGoalStatus } from "./progress";

const at = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`);

describe("calculateGoalProgress", () => {
  const events = [
    { leadId: "lead-1", actorId: "caller-old", kind: "appointment_scheduled", metadata: {}, occurredAt: at(1) },
    { leadId: "lead-1", actorId: "caller-1", kind: "caller_assigned", metadata: {}, occurredAt: at(2) },
    { leadId: "lead-1", actorId: "caller-1", kind: "caller_feedback", metadata: { questions: [{ questionKey: "isContacted", answer: "Si" }, { questionKey: "callerOutcome", answer: "Agenda" }] }, occurredAt: at(3) },
    { leadId: "lead-1", actorId: "caller-1", kind: "appointment_scheduled", metadata: {}, occurredAt: at(3) },
    { leadId: "lead-1", actorId: "closer-1", kind: "closer_feedback", metadata: { questions: [{ questionKey: "closerOutcome", answer: "Venta" }] }, occurredAt: at(4) },
    { leadId: "lead-2", actorId: "caller-1", kind: "caller_feedback", metadata: { questions: [{ questionKey: "isContacted", answer: "Si" }, { questionKey: "callerOutcome", answer: "Llamar a futuro" }] }, occurredAt: at(5) },
  ];

  it("counts positive caller metrics inside the custom interval", () => {
    const interval = { events, userId: "caller-1", startDate: "2026-08-01", endDate: "2026-08-31" };
    expect(calculateGoalProgress({ ...interval, metric: "assigned" })).toBe(1);
    expect(calculateGoalProgress({ ...interval, metric: "contacted" })).toBe(2);
    expect(calculateGoalProgress({ ...interval, metric: "appointments" })).toBe(1);
    expect(calculateGoalProgress({ ...interval, metric: "future_calls" })).toBe(1);
    expect(calculateGoalProgress({ ...interval, metric: "appointment_rate" })).toBe(50);
  });

  it("credits the same show to its caller and closer", () => {
    const interval = { events, metric: "shows" as const, startDate: "2026-08-01", endDate: "2026-08-31" };
    expect(calculateGoalProgress({ ...interval, userId: "caller-1" })).toBe(1);
    expect(calculateGoalProgress({ ...interval, userId: "closer-1" })).toBe(1);
    expect(calculateGoalProgress({ ...interval, userId: "caller-old" })).toBe(0);
  });
});

describe("getGoalStatus", () => {
  it("classifies upcoming, active and completed custom intervals", () => {
    expect(getGoalStatus("2026-08-20", "2026-08-30", at(18))).toBe("upcoming");
    expect(getGoalStatus("2026-08-01", "2026-08-30", at(18))).toBe("active");
    expect(getGoalStatus("2026-08-01", "2026-08-10", at(18))).toBe("completed");
  });
});
