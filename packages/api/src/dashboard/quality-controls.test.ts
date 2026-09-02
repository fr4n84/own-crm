import { describe, expect, it } from "vitest";

import {
  buildQualityControls,
  type QualityLead,
  type QualitySettings,
} from "./quality-controls";

const settings: QualitySettings = {
  callerAbandonedHours: 24,
  closerAbandonedHours: 12,
  callerFollowUpGraceHours: 0,
  closerFollowUpGraceHours: 2,
  callerLowConversionPercent: 60,
  closerLowConversionPercent: 60,
};

function lead(overrides: Partial<QualityLead> = {}): QualityLead {
  return {
    id: "lead-1",
    name: "Ada Lead",
    email: "ada@example.com",
    callerId: "caller-1",
    callerName: "Carla Caller",
    closerId: "closer-1",
    closerName: "Clara Closer",
    assignedAt: new Date("2026-08-10T08:00:00.000Z"),
    events: [],
    ...overrides,
  };
}

describe("buildQualityControls", () => {
  it("uses the latest role activity for abandonment and excludes terminal leads", () => {
    const result = buildQualityControls(
      [
        lead({
          events: [
            {
              kind: "caller_feedback",
              actorRole: "caller",
              description: "Contactado",
              occurredAt: new Date("2026-08-11T12:00:00.000Z"),
              metadata: null,
            },
          ],
        }),
        lead({
          id: "terminal",
          events: [
            {
              kind: "closer_feedback",
              actorRole: "closer",
              description: "Venta",
              occurredAt: new Date("2026-08-10T09:00:00.000Z"),
              metadata: null,
            },
            {
              kind: "caller_feedback",
              actorRole: "caller",
              description: "Contactado",
              occurredAt: new Date("2026-08-10T10:00:00.000Z"),
              metadata: null,
            },
          ],
        }),
      ],
      settings,
      new Date("2026-08-12T10:00:00.000Z"),
    );

    expect(result.abandoned.caller).toEqual([]);
    expect(result.abandoned.closer.map((item) => item.leadId)).toEqual(["lead-1"]);
  });

  it("finds overdue caller and closer follow-ups and ignores a superseded agreement", () => {
    const result = buildQualityControls(
      [
        lead({
          events: [
            {
              kind: "caller_feedback",
              actorRole: "caller",
              description: "Llamar a futuro",
              occurredAt: new Date("2026-08-10T09:00:00.000Z"),
              metadata: {
                questions: [
                  { key: "scheduledDate", value: "2026-08-10" },
                  { key: "scheduledTime", value: "10:00" },
                ],
              },
            },
            {
              kind: "closer_feedback",
              actorRole: "closer",
              description: "Seguimiento",
              occurredAt: new Date("2026-08-10T11:00:00.000Z"),
              metadata: {
                questions: [
                  { key: "scheduledDate", value: "2026-08-11" },
                  { key: "scheduledTime", value: "08:00" },
                ],
              },
            },
          ],
        }),
        lead({
          id: "superseded",
          events: [
            {
              kind: "caller_feedback",
              actorRole: "caller",
              description: "Llamar a futuro",
              occurredAt: new Date("2026-08-10T09:00:00.000Z"),
              metadata: {
                questions: [
                  { key: "scheduledDate", value: "2026-08-10" },
                  { key: "scheduledTime", value: "10:00" },
                ],
              },
            },
            {
              kind: "caller_feedback",
              actorRole: "caller",
              description: "Contactado",
              occurredAt: new Date("2026-08-10T12:00:00.000Z"),
              metadata: null,
            },
          ],
        }),
      ],
      settings,
      new Date("2026-08-11T12:00:00.000Z"),
    );

    expect(result.lateFollowUps.caller.map((item) => item.leadId)).toEqual(["lead-1"]);
    expect(result.lateFollowUps.closer.map((item) => item.leadId)).toEqual(["lead-1"]);
  });

  it("reports low conversion by role with its percentage and denominator", () => {
    const result = buildQualityControls(
      [
        lead(),
        lead({
          id: "lead-2",
          events: [
            {
              kind: "appointment_scheduled",
              actorRole: "caller",
              description: null,
              occurredAt: new Date("2026-08-10T10:00:00.000Z"),
              metadata: null,
            },
            {
              kind: "closer_feedback",
              actorRole: "closer",
              description: "Venta",
              occurredAt: new Date("2026-08-11T10:00:00.000Z"),
              metadata: null,
            },
          ],
        }),
      ],
      settings,
      new Date("2026-08-12T10:00:00.000Z"),
    );

    expect(result.lowConversion.caller).toEqual([
      {
        userId: "caller-1",
        userName: "Carla Caller",
        converted: 1,
        total: 2,
        percentage: 50,
        threshold: 60,
      },
    ]);
    expect(result.lowConversion.closer).toEqual([
      {
        userId: "closer-1",
        userName: "Clara Closer",
        converted: 1,
        total: 2,
        percentage: 50,
        threshold: 60,
      },
    ]);
  });
});
