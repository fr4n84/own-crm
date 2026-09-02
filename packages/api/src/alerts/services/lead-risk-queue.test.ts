import { describe, expect, it } from "vitest";

import { buildLeadRiskQueue } from "./lead-risk-queue";

const now = new Date("2026-08-22T12:00:00.000Z");

function minutesAgo(minutes: number) {
  return new Date(now.getTime() - minutes * 60_000);
}

function lead(id: string, callerId = "caller-a") {
  return {
    id,
    name: `Lead ${id}`,
    callerId,
    caller: { id: callerId, name: callerId === "caller-a" ? "Ana" : "Bruno" },
  };
}

function assignment(id: string, leadId: string, callerId: string, minutes: number) {
  return {
    id,
    leadId,
    actorId: callerId,
    kind: "caller_assigned",
    description: null,
    metadata: {},
    occurredAt: minutesAgo(minutes),
  };
}

function feedback(id: string, leadId: string, minutes: number, description: string) {
  return {
    id,
    leadId,
    actorId: null,
    kind: "caller_feedback",
    description,
    metadata: {},
    occurredAt: minutesAgo(minutes),
  };
}

describe("buildLeadRiskQueue", () => {
  it("prioritizes uncontacted current assignments and ignores contacted or recent leads", () => {
    const queue = buildLeadRiskQueue({
      now,
      leads: [
        lead("critical"),
        lead("high"),
        lead("medium"),
        lead("low"),
        lead("recent"),
        lead("contacted"),
        lead("reassigned", "caller-b"),
      ],
      events: [
        assignment("a1", "critical", "caller-a", 1_500),
        assignment("a2", "high", "caller-a", 240),
        feedback("f1", "high", 200, "Lead no contactado"),
        feedback("f2", "high", 120, "Lead no contactado"),
        assignment("a3", "medium", "caller-a", 90),
        assignment("a4", "low", "caller-a", 30),
        assignment("a5", "recent", "caller-a", 10),
        assignment("a6", "contacted", "caller-a", 300),
        feedback("f3", "contacted", 250, "Agenda"),
        assignment("old", "reassigned", "caller-a", 300),
        feedback("old-contact", "reassigned", 250, "Agenda"),
        assignment("new", "reassigned", "caller-b", 120),
      ],
    });

    expect(queue.map(({ lead, priority }) => [lead.id, priority])).toEqual([
      ["critical", "critical"],
      ["high", "high"],
      ["reassigned", "medium"],
      ["medium", "medium"],
      ["low", "low"],
    ]);
    expect(queue.find(({ lead: item }) => item.id === "high")).toMatchObject({
      attemptCount: 2,
      minutesSinceAssignment: 240,
      minutesSinceLastAttempt: 120,
    });
    expect(queue.find(({ lead: item }) => item.id === "reassigned")).toMatchObject({
      attemptCount: 0,
      minutesSinceAssignment: 120,
      assignedAt: minutesAgo(120),
    });
  });
});
