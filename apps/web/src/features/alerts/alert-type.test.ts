import { describe, expect, it } from "vitest";

import {
  filterAlertsByType,
  getAppointmentHistory,
} from "./alert-type";

const callerQuestion = (questionKey: string, answer: string) => ({
  questionKey,
  answer,
  authorRole: "caller" as const,
});

const closerQuestion = (questionKey: string, answer: string) => ({
  questionKey,
  answer,
  authorRole: "closer" as const,
});

const alerts = [
  {
    id: "follow-up",
    kind: "follow_up",
    message: "Seguimiento pendiente",
    lead: { questions: [] },
  },
  {
    id: "no-contact",
    kind: "no_contact",
    message: "Sin contacto",
    lead: { questions: [] },
  },
  {
    id: "future-call",
    kind: "no_contact",
    message: "Llamar a futuro",
    lead: { questions: [] },
  },
  {
    id: "appointment",
    kind: "appointment",
    message: "Agenda",
    lead: {
      questions: [callerQuestion("appointmentRescheduled", "No")],
    },
  },
  {
    id: "rescheduled",
    kind: "rescheduled",
    message: "Reagenda",
    lead: {
      questions: [
        callerQuestion("appointmentRescheduled", "Si"),
        callerQuestion("firstAppointmentDate", "2099-01-01"),
        callerQuestion("firstAppointmentTime", "10:00"),
        callerQuestion(
          "appointmentHistory",
          JSON.stringify([
            { date: "2099-01-01", time: "10:00" },
            { date: "2099-01-02", time: "11:00" },
          ]),
        ),
        closerQuestion(
          "appointmentHistory",
          JSON.stringify([
            { date: "2099-01-01", time: "10:00" },
            { date: "2099-01-02", time: "11:00" },
            { date: "2099-01-03", time: "12:00" },
          ]),
        ),
      ],
    },
  },
];

describe("alert type filter", () => {
  it.each([
    ["all", ["follow-up", "no-contact", "future-call", "appointment", "rescheduled"]],
    ["no_contact", ["no-contact"]],
    ["follow_up", ["follow-up"]],
    ["future_call", ["future-call"]],
    ["appointment", ["appointment"]],
    ["rescheduled", ["rescheduled"]],
  ] as const)("filters %s independently", (filter, expectedIds) => {
    expect(filterAlertsByType(alerts, filter).map((alert) => alert.id)).toEqual(
      expectedIds,
    );
  });

  it("returns the complete schedule history only for the rescheduled card", () => {
    expect(getAppointmentHistory(alerts[4])).toEqual([
      { date: "2099-01-01", time: "10:00" },
      { date: "2099-01-02", time: "11:00" },
      { date: "2099-01-03", time: "12:00" },
    ]);
    expect(getAppointmentHistory(alerts[3])).toEqual([]);
  });

  it("classifies by the current alert kind, never by historical schedules", () => {
    const currentAppointmentWithHistory = {
      ...alerts[3],
      lead: {
        questions: [
          callerQuestion(
            "appointmentHistory",
            JSON.stringify([
              { date: "2099-01-01", time: "10:00" },
              { date: "2099-01-02", time: "11:00" },
            ]),
          ),
        ],
      },
    };

    expect(
      filterAlertsByType([currentAppointmentWithHistory], "appointment"),
    ).toHaveLength(1);
    expect(
      filterAlertsByType([currentAppointmentWithHistory], "rescheduled"),
    ).toHaveLength(0);
  });
});
