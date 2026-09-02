import { describe, expect, it } from "vitest";

import {
  buildConversionFunnel,
  selectConversionCohort,
} from "./conversion-funnel";

const assignedAt = new Date("2026-08-01T10:00:00.000Z");

function lead(
  id: string,
  overrides: Partial<Parameters<typeof buildConversionFunnel>[0][number]> = {},
) {
  return {
    id,
    name: `Lead ${id}`,
    email: `${id}@example.com`,
    phone: "600000000",
    type: "maestra" as const,
    callerId: "caller-1",
    callerName: "Caller One",
    closerId: "closer-1",
    closerName: "Closer One",
    assignedAt,
    events: [],
    ...overrides,
  };
}

function event(
  kind:
    | "caller_feedback"
    | "closer_feedback"
    | "appointment_scheduled"
    | "appointment_rescheduled",
  description: string,
  minute: number,
  overrides: { actorRole?: string; metadata?: Record<string, unknown> } = {},
) {
  return {
    id: `${kind}-${minute}-${description}`,
    kind,
    description,
    occurredAt: new Date(assignedAt.getTime() + minute * 60_000),
    metadata: overrides.metadata ?? {},
    actorRole: overrides.actorRole,
  };
}

describe("buildConversionFunnel", () => {
  it("builds a monotonic cohort and calculates conversion from the previous stage", () => {
    const result = buildConversionFunnel([
      lead("sale", {
        events: [
          event("caller_feedback", "Agenda", 1),
          event("appointment_scheduled", "2026-08-10 a las 12:00", 2),
          event("closer_feedback", "Seguimiento", 3),
          event("closer_feedback", "Venta", 4),
        ],
      }),
      lead("agenda", {
        events: [
          event("caller_feedback", "Agenda", 1),
          event("appointment_scheduled", "2026-08-11 a las 12:00", 2),
        ],
      }),
      lead("contact", {
        events: [event("caller_feedback", "Llamar a futuro", 1)],
      }),
      lead("assigned"),
    ]);

    expect(result.stages.map((stage) => stage.count)).toEqual([4, 3, 2, 1, 1]);
    expect(result.stages.map((stage) => stage.previousConversion)).toEqual([
      100,
      75,
      66.7,
      50,
      100,
    ]);
    expect(result.totalConversion).toBe(25);
    expect(result.stages[4]?.leads.map((item) => item.id)).toEqual(["sale"]);
  });

  it("deduplicates leads and does not count multiple reschedules as new agendas", () => {
    const repeated = lead("repeated", {
      events: [
        event("caller_feedback", "Agenda", 1),
        event("appointment_scheduled", "first", 2),
        event("appointment_rescheduled", "second", 3),
        event("appointment_rescheduled", "third", 4),
      ],
    });

    const result = buildConversionFunnel([repeated, repeated]);

    expect(result.stages.map((stage) => stage.count)).toEqual([1, 1, 1, 0, 0]);
  });

  it("does not count an administrative Q&A edit as caller contact", () => {
    const result = buildConversionFunnel([
      lead("admin-edited", {
        events: [event("caller_feedback", "Se actualizaron las respuestas registradas del lead", 1, {
          actorRole: "admin",
          metadata: { activitySource: "administrative_qa_edit" },
        })],
      }),
    ]);

    expect(result.stages.map((stage) => stage.count)).toEqual([1, 0, 0, 0, 0]);
  });

  it("keeps no-show and not-interested as exits while follow-up remains open", () => {
    const result = buildConversionFunnel([
      lead("no-show", {
        events: [
          event("caller_feedback", "Agenda", 1),
          event("appointment_scheduled", "agenda", 2),
          event("closer_feedback", "No-show", 3),
        ],
      }),
      lead("not-interested", {
        events: [event("caller_feedback", "No interesado", 1)],
      }),
      lead("follow-up", {
        events: [
          event("caller_feedback", "Agenda", 1),
          event("appointment_scheduled", "agenda", 2),
          event("closer_feedback", "Seguimiento", 3),
        ],
      }),
    ]);

    expect(result.exits).toEqual({ noShow: 1, notInterested: 1, followUp: 1 });
    expect(result.stages[3]?.leads.map((item) => item.id)).toEqual(["follow-up"]);
    expect(result.stages[4]?.count).toBe(0);
  });

  it("applies assignment interval, caller, closer and type filters simultaneously", () => {
    const cohort = selectConversionCohort(
      [
        lead("pair", { callerId: "caller-2", closerId: "closer-3", type: "vsl" }),
        lead("wrong-caller", { callerId: "caller-1", closerId: "closer-3", type: "vsl" }),
        lead("wrong-closer", { callerId: "caller-2", closerId: "closer-1", type: "vsl" }),
        lead("wrong-type", { callerId: "caller-2", closerId: "closer-3", type: "maestra" }),
        lead("outside", {
          callerId: "caller-2",
          closerId: "closer-3",
          type: "vsl",
          assignedAt: new Date("2026-07-31T23:59:59.999Z"),
        }),
      ],
      {
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-31T23:59:59.999Z"),
        callerId: "caller-2",
        closerId: "closer-3",
        type: "vsl",
      },
    );
    const result = buildConversionFunnel(cohort);

    expect(result.stages[0]?.leads).toMatchObject([
      { id: "pair", callerId: "caller-2", closerId: "closer-3" },
    ]);
  });
});
