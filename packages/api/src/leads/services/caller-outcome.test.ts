import { describe, expect, it } from "vitest";

import {
  buildAppointmentTrackingQuestions,
  validateCallerOutcomeInput,
} from "./caller-outcome";

describe("caller outcome validation", () => {
  it("accepts outcomes without additional fields", () => {
    expect(validateCallerOutcomeInput({ outcome: "not_fit" })).toBeUndefined();
    expect(
      validateCallerOutcomeInput({ outcome: "not_interested" }),
    ).toBeUndefined();
  });

  it("requires date, time, and severity for future calls", () => {
    expect(validateCallerOutcomeInput({ outcome: "future_call" })).toEqual({
      scheduledDate: "Required",
      scheduledTime: "Required",
      alertSeverity: "Required",
    });
  });

  it("requires closer, date, and time for appointments", () => {
    expect(validateCallerOutcomeInput({ outcome: "appointment" })).toEqual({
      closerId: "Required",
      scheduledDate: "Required",
      scheduledTime: "Required",
    });
  });

  it("rejects scheduled values in the past", () => {
    expect(
      validateCallerOutcomeInput({
        outcome: "future_call",
        scheduledDate: "2020-01-01",
        scheduledTime: "10:00",
        alertSeverity: "warning",
      }),
    ).toEqual({ scheduledDate: "Must be in the future" });
  });
});

describe("appointment tracking", () => {
  const callerId = "caller-1";

  it("records the first appointment date and time", () => {
    expect(
      buildAppointmentTrackingQuestions({
        existingQuestions: [],
        callerId,
        scheduledDate: "2099-01-01",
        scheduledTime: "10:00",
        changedAt: "2098-12-01T09:00:00.000Z",
      }),
    ).toEqual([
      expect.objectContaining({
        questionKey: "firstAppointmentDate",
        answer: "2099-01-01",
      }),
      expect.objectContaining({
        questionKey: "firstAppointmentTime",
        answer: "10:00",
      }),
      expect.objectContaining({
        questionKey: "appointmentRescheduled",
        answer: "No",
      }),
      expect.objectContaining({
        questionKey: "appointmentHistory",
        answer: JSON.stringify([
          { date: "2099-01-01", time: "10:00" },
        ]),
      }),
    ]);
  });

  it("preserves the first appointment and records a changed date as a reschedule", () => {
    const existingQuestions = [
      {
        questionKey: "callerOutcome",
        answer: "Agenda",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "scheduledDate",
        answer: "2099-01-01",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "scheduledTime",
        answer: "10:00",
        authorRole: "caller" as const,
        authorId: callerId,
      },
    ];

    expect(
      buildAppointmentTrackingQuestions({
        existingQuestions,
        callerId,
        scheduledDate: "2099-01-02",
        scheduledTime: "11:00",
        changedAt: "2098-12-02T09:00:00.000Z",
      }),
    ).toEqual([
      expect.objectContaining({
        questionKey: "firstAppointmentDate",
        answer: "2099-01-01",
      }),
      expect.objectContaining({
        questionKey: "firstAppointmentTime",
        answer: "10:00",
      }),
      expect.objectContaining({
        questionKey: "appointmentRescheduled",
        answer: "Si",
      }),
      expect.objectContaining({
        questionKey: "appointmentRescheduledAt",
        answer: "2098-12-02T09:00:00.000Z",
      }),
      expect.objectContaining({
        questionKey: "appointmentHistory",
        answer: JSON.stringify([
          { date: "2099-01-01", time: "10:00" },
          { date: "2099-01-02", time: "11:00" },
        ]),
      }),
    ]);
  });

  it("keeps the reschedule marker and original appointment on later edits", () => {
    const existingQuestions = [
      {
        questionKey: "firstAppointmentDate",
        answer: "2099-01-01",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "firstAppointmentTime",
        answer: "10:00",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "scheduledDate",
        answer: "2099-01-02",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "scheduledTime",
        answer: "11:00",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "appointmentRescheduled",
        answer: "Si",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "appointmentRescheduledAt",
        answer: "2098-12-02T09:00:00.000Z",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "appointmentHistory",
        answer: JSON.stringify([
          { date: "2099-01-01", time: "10:00" },
          { date: "2099-01-02", time: "11:00" },
        ]),
        authorRole: "caller" as const,
        authorId: callerId,
      },
    ];

    expect(
      buildAppointmentTrackingQuestions({
        existingQuestions,
        callerId,
        scheduledDate: "2099-01-02",
        scheduledTime: "11:00",
        changedAt: "2098-12-03T09:00:00.000Z",
      }),
    ).toEqual([
      expect.objectContaining({
        questionKey: "firstAppointmentDate",
        answer: "2099-01-01",
      }),
      expect.objectContaining({
        questionKey: "firstAppointmentTime",
        answer: "10:00",
      }),
      expect.objectContaining({
        questionKey: "appointmentRescheduled",
        answer: "Si",
      }),
      expect.objectContaining({
        questionKey: "appointmentRescheduledAt",
        answer: "2098-12-02T09:00:00.000Z",
      }),
      expect.objectContaining({
        questionKey: "appointmentHistory",
        answer: JSON.stringify([
          { date: "2099-01-01", time: "10:00" },
          { date: "2099-01-02", time: "11:00" },
        ]),
      }),
    ]);
  });

  it("continues appointment history when the latest schedule was written by a closer", () => {
    const existingQuestions = [
      {
        questionKey: "callerOutcome",
        answer: "Agenda",
        authorRole: "caller" as const,
        authorId: callerId,
      },
      {
        questionKey: "scheduledDate",
        answer: "2099-01-02",
        authorRole: "closer" as const,
        authorId: "closer-1",
      },
      {
        questionKey: "scheduledTime",
        answer: "11:00",
        authorRole: "closer" as const,
        authorId: "closer-1",
      },
      {
        questionKey: "appointmentHistory",
        answer: JSON.stringify([
          { date: "2099-01-01", time: "10:00" },
          { date: "2099-01-02", time: "11:00" },
        ]),
        authorRole: "closer" as const,
        authorId: "closer-1",
      },
    ];

    const result = buildAppointmentTrackingQuestions({
      existingQuestions,
      callerId,
      scheduledDate: "2099-01-03",
      scheduledTime: "12:00",
      changedAt: "2098-12-03T09:00:00.000Z",
    });

    expect(result).toContainEqual(
      expect.objectContaining({
        questionKey: "appointmentHistory",
        answer: JSON.stringify([
          { date: "2099-01-01", time: "10:00" },
          { date: "2099-01-02", time: "11:00" },
          { date: "2099-01-03", time: "12:00" },
        ]),
      }),
    );
  });
});
