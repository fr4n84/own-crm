import { describe, expect, it } from "vitest";

import {
  aggregateLeadConditions,
  aggregateCloserConditions,
  aggregateHistoricalConditions,
  CLOSER_CONDITION_LABELS,
  classifyCloserCondition,
  classifyLeadCondition,
} from "./personal-statistics";

const question = (questionKey: string, answer: string) => ({
  questionKey,
  question: questionKey,
  answer,
  authorRole: "caller" as const,
  authorId: "caller-1",
});

const closerQuestion = (questionKey: string, answer: string) => ({
  questionKey,
  question: questionKey,
  answer,
  authorRole: "closer" as const,
  authorId: "closer-1",
});

describe("personal lead statistics", () => {
  it.each([
    ["sin asignar", [], "unassigned"],
    ["Asignado", [], "assigned"],
    ["número erróneo", [], "wrong_number"],
    ["Asignado", [question("isContacted", "No")], "no_contact"],
    ["Asignado", [question("callerOutcome", "Llamar a futuro")], "future_call"],
    ["Asignado", [question("callerOutcome", "No encaja")], "not_fit"],
    ["Asignado", [question("callerOutcome", "No interesado")], "not_interested"],
    ["Asignado", [question("callerOutcome", "Agenda")], "appointment"],
    [
      "Asignado",
      [
        question("callerOutcome", "Agenda"),
        question("appointmentRescheduled", "Si"),
      ],
      "rescheduled",
    ],
  ])("classifies %s as %s", (state, questions, expected) => {
    expect(classifyLeadCondition({ state, questions })).toBe(expected);
  });

  it("uses the latest contact event instead of a stale outcome", () => {
    expect(
      classifyLeadCondition({
        state: "Asignado",
        questions: [
          question("callerOutcome", "Agenda"),
          question("isContacted", "No"),
        ],
      }),
    ).toBe("no_contact");
  });

  it("counts discarded leads as terminal negative outcomes", () => {
    const result = aggregateLeadConditions([
      { state: "número erróneo", questions: [] },
      {
        state: "Asignado",
        questions: [question("callerOutcome", "No encaja")],
      },
      {
        state: "Asignado",
        questions: [question("callerOutcome", "No interesado")],
      },
      { state: "Asignado", questions: [] },
    ]);

    expect(result.total).toBe(4);
    expect(result.discarded).toBe(3);
    expect(result.counts.assigned).toBe(1);
  });

  it.each([
    [
      [question("callerOutcome", "Agenda")],
      "appointment",
    ],
    [
      [
        question("callerOutcome", "Agenda"),
        question("appointmentRescheduled", "Si"),
      ],
      "rescheduled",
    ],
    [
      [
        question("callerOutcome", "Agenda"),
        closerQuestion("closerOutcome", "Seguimiento"),
      ],
      "follow_up",
    ],
    [
      [
        question("callerOutcome", "Agenda"),
        closerQuestion("closerOutcome", "Venta"),
      ],
      "sale",
    ],
    [
      [
        question("callerOutcome", "Agenda"),
        closerQuestion("closerOutcome", "No interesado"),
      ],
      "not_interested",
    ],
    [
      [
        question("callerOutcome", "Agenda"),
        closerQuestion("closerOutcome", "No-show"),
      ],
      "no_show",
    ],
    [
      [
        question("callerOutcome", "Agenda"),
        closerQuestion("isContacted", "No"),
      ],
      "no_show",
    ],
  ])("classifies closer agenda outcome as %s", (questions, expected) => {
    expect(classifyCloserCondition({ state: "Asignado", questions })).toBe(
      expected,
    );
  });

  it("aggregates the closer-specific metrics", () => {
    const result = aggregateCloserConditions([
      {
        state: "Asignado",
        questions: [question("callerOutcome", "Agenda")],
      },
      {
        state: "Asignado",
        questions: [
          question("callerOutcome", "Agenda"),
          closerQuestion("closerOutcome", "Venta"),
        ],
      },
      {
        state: "Asignado",
        questions: [
          question("callerOutcome", "Agenda"),
          closerQuestion("closerOutcome", "No interesado"),
        ],
      },
    ]);

    expect(result.total).toBe(3);
    expect(result.counts).toEqual({
      appointment: 1,
      rescheduled: 0,
      follow_up: 0,
      sale: 1,
      not_interested: 1,
      no_show: 0,
    });
  });

  it("uses No interesado as the only negative sale outcome", () => {
    expect(Object.values(CLOSER_CONDITION_LABELS)).not.toContain("No venta");
    expect(Object.values(CLOSER_CONDITION_LABELS)).toContain("No interesado");
    expect(Object.values(CLOSER_CONDITION_LABELS)).toContain("No-show");
  });

  it("keeps a caller outcome in its real interval when the lead changes later", () => {
    const result = aggregateHistoricalConditions(
      [
        {
          leadId: "lead-1",
          actorId: "caller-1",
          actorRole: "caller",
          kind: "caller_feedback",
          description: "Agenda",
          metadata: { questions: [question("callerOutcome", "Agenda")] },
          occurredAt: new Date("2026-08-02T10:00:00.000Z"),
        },
        {
          leadId: "lead-1",
          actorId: "caller-1",
          actorRole: "caller",
          kind: "caller_feedback",
          description: "No interesado",
          metadata: { questions: [question("callerOutcome", "No interesado")] },
          occurredAt: new Date("2026-08-15T10:00:00.000Z"),
        },
      ],
      {
        mode: "caller",
        userId: "caller-1",
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-05T23:59:59.999Z"),
      },
    );

    expect(result.total).toBe(1);
    expect(result.counts.appointment).toBe(1);
    expect(result.counts.not_interested).toBe(0);
  });

  it("attributes closer results to the closer who performed the action", () => {
    const result = aggregateHistoricalConditions(
      [
        {
          leadId: "lead-1",
          actorId: "closer-1",
          actorRole: "closer",
          kind: "closer_feedback",
          description: "Venta",
          metadata: { questions: [closerQuestion("closerOutcome", "Venta")] },
          occurredAt: new Date("2026-08-04T10:00:00.000Z"),
        },
        {
          leadId: "lead-2",
          actorId: "closer-2",
          actorRole: "closer",
          kind: "closer_feedback",
          description: "Venta",
          metadata: { questions: [closerQuestion("closerOutcome", "Venta")] },
          occurredAt: new Date("2026-08-04T11:00:00.000Z"),
        },
      ],
      {
        mode: "closer",
        userId: "closer-1",
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-05T23:59:59.999Z"),
      },
    );

    expect(result.total).toBe(1);
    expect(result.counts.sale).toBe(1);
  });
});
