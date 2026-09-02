import { describe, expect, it } from "vitest";

import {
  filterAgendaLeads,
  filterAgendaLeadsByCloser,
  filterAgendaLeadsByCloserOutcome,
  filterAgendaLeadsByDateRange,
  formatLocalDate,
  getAgendaClosers,
  type AgendaQuestion,
} from "./agenda-utils";

const lead = (questions: AgendaQuestion[]) => ({
  id: "lead-1",
  name: "Lead 1",
  caller: { id: "caller-1", name: "Caller 1" },
  closer: { id: "closer-1", name: "Closer 1" },
  questions,
});

describe("agenda lead helpers", () => {
  it("returns agenda leads with caller, closer, date, and time", () => {
    expect(
      filterAgendaLeads([
        lead([
          { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
          { questionKey: "scheduledDate", answer: "2099-01-01", authorRole: "caller" },
          { questionKey: "scheduledTime", answer: "10:00", authorRole: "caller" },
        ]),
      ]),
    ).toMatchObject([
      { id: "lead-1", scheduledDate: "2099-01-01", scheduledTime: "10:00" },
    ]);
  });

  it("uses the latest schedule even when a closer performed the reschedule", () => {
    expect(
      filterAgendaLeads([
        lead([
          { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
          { questionKey: "scheduledDate", answer: "2099-01-01", authorRole: "caller" },
          { questionKey: "scheduledTime", answer: "10:00", authorRole: "caller" },
          { questionKey: "scheduledDate", answer: "2099-01-02", authorRole: "closer" },
          { questionKey: "scheduledTime", answer: "11:00", authorRole: "closer" },
        ]),
      ]),
    ).toMatchObject([
      { scheduledDate: "2099-01-02", scheduledTime: "11:00" },
    ]);
  });

  it("excludes non-agenda outcomes and respects the latest caller outcome", () => {
    expect(
      filterAgendaLeads([
        lead([{ questionKey: "callerOutcome", answer: "No encaja", authorRole: "caller" }]),
        lead([
          { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
          { questionKey: "callerOutcome", answer: "No interesado", authorRole: "caller" },
        ]),
      ]),
    ).toEqual([]);
  });

  it("filters agendas by closer without changing the unfiltered result", () => {
    const firstLead = lead([
      {
        questionKey: "callerOutcome",
        answer: "Agenda",
        authorRole: "caller",
      },
    ]);
    const secondLead = {
      ...firstLead,
      id: "lead-2",
      closer: { id: "closer-2", name: "Closer 2" },
    };
    const agendas = filterAgendaLeads([firstLead, secondLead]);

    expect(filterAgendaLeadsByCloser(agendas, "all")).toEqual(agendas);
    expect(filterAgendaLeadsByCloser(agendas, "closer-2")).toEqual([
      expect.objectContaining({ id: "lead-2" }),
    ]);
  });

  it("returns each agenda closer once and sorts them by name", () => {
    const agendas = filterAgendaLeads([
      lead([
        {
          questionKey: "callerOutcome",
          answer: "Agenda",
          authorRole: "caller",
        },
      ]),
      {
        ...lead([
          {
            questionKey: "callerOutcome",
            answer: "Agenda",
            authorRole: "caller",
          },
        ]),
        id: "lead-2",
      },
      {
        ...lead([
          {
            questionKey: "callerOutcome",
            answer: "Agenda",
            authorRole: "caller",
          },
        ]),
        id: "lead-3",
        closer: { id: "closer-0", name: "Ana" },
      },
    ]);

    expect(getAgendaClosers(agendas)).toEqual([
      { id: "closer-0", name: "Ana" },
      { id: "closer-1", name: "Closer 1" },
    ]);
  });

  it("filters agendas by an inclusive scheduled date interval", () => {
    const [baseAgenda] = filterAgendaLeads([
      lead([
        {
          questionKey: "callerOutcome",
          answer: "Agenda",
          authorRole: "caller",
        },
      ]),
    ]);
    if (!baseAgenda) throw new Error("Expected agenda fixture");

    const agendas = [
      { ...baseAgenda, scheduledDate: "2026-08-17" },
      { ...baseAgenda, id: "lead-2", scheduledDate: "2026-08-18" },
      { ...baseAgenda, id: "lead-3", scheduledDate: "2026-08-19" },
    ];

    expect(
      filterAgendaLeadsByDateRange(agendas, "2026-08-17", "2026-08-18"),
    ).toMatchObject([{ id: "lead-1" }, { id: "lead-2" }]);
  });

  it("formats quick-filter dates in the local calendar timezone", () => {
    expect(formatLocalDate(new Date(2026, 7, 17, 23, 30))).toBe("2026-08-17");
  });

  it("exposes only the latest canonical closer answer as agenda feedback", () => {
    const [agenda] = filterAgendaLeads([
      lead([
        { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
        { questionKey: "closerOutcome", answer: "Seguimiento", authorRole: "closer" },
        { questionKey: "closerFeedback", answer: "Texto libre", authorRole: "closer" },
        { questionKey: "closerOutcome", answer: "Venta", authorRole: "closer" },
      ]),
    ]);

    expect(agenda?.closerOutcome).toBe("Venta");
    expect(agenda?.closerOutcome).not.toBe("Texto libre");
  });

  it("filters independently by canonical closer outcome and missing feedback", () => {
    const agendas = filterAgendaLeads([
      lead([
        { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
        { questionKey: "closerOutcome", answer: "No-show", authorRole: "closer" },
      ]),
      {
        ...lead([
          { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
        ]),
        id: "lead-2",
      },
      {
        ...lead([
          { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
          { questionKey: "closerOutcome", answer: "Texto libre", authorRole: "closer" },
        ]),
        id: "lead-3",
      },
    ]);

    expect(filterAgendaLeadsByCloserOutcome(agendas, "No-show")).toMatchObject([
      { id: "lead-1" },
    ]);
    expect(filterAgendaLeadsByCloserOutcome(agendas, "none")).toMatchObject([
      { id: "lead-2" },
      { id: "lead-3" },
    ]);
    expect(filterAgendaLeadsByCloserOutcome(agendas, "all")).toHaveLength(3);
  });
});
