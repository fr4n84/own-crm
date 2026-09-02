import { describe, expect, it } from "vitest";

import {
  buildLegacyLeadActivity,
  mergeLeadActivity,
} from "./lead-activity";

describe("lead activity", () => {
  it("reconstructs the appointment sequence without inventing missing timestamps", () => {
    const events = buildLegacyLeadActivity({
      lead: {
        id: "lead-1",
        createdAt: new Date("2026-08-01T10:00:00Z"),
        updatedAt: new Date("2026-08-03T12:00:00Z"),
        callerId: "caller-1",
        closerId: "closer-1",
        questions: [
          {
            questionKey: "appointmentHistory",
            question: "Historial de agenda",
            answer: JSON.stringify([
              { date: "2026-08-10", time: "10:00" },
              { date: "2026-08-12", time: "12:30" },
            ]),
            authorRole: "caller",
            authorId: "caller-1",
          },
        ],
      },
      alerts: [],
    });

    expect(events.map((event) => event.kind)).toEqual([
      "lead_created",
      "caller_assigned",
      "closer_assigned",
      "appointment_scheduled",
      "appointment_rescheduled",
    ]);
    expect(events.at(-1)?.metadata).toMatchObject({
      scheduledDate: "2026-08-12",
      scheduledTime: "12:30",
      reconstructed: true,
    });
    expect(events.at(-1)?.occurredAt).toBeNull();
  });

  it("shows legacy alert lifecycle events and removes duplicates from the ledger", () => {
    const occurredAt = new Date("2026-08-04T09:00:00Z");
    const legacy = buildLegacyLeadActivity({
      lead: {
        id: "lead-1",
        createdAt: occurredAt,
        updatedAt: occurredAt,
        callerId: null,
        closerId: null,
        questions: [],
      },
      alerts: [
        {
          id: "alert-1",
          kind: "follow_up",
          message: "Seguimiento",
          severity: "warning",
          targetUserId: "caller-1",
          createdAt: occurredAt,
          dismissedAt: null,
          resolvedAt: new Date("2026-08-05T09:00:00Z"),
          dismissedBy: null,
        },
      ],
    });

    const merged = mergeLeadActivity([
      ...legacy,
      {
        id: "ledger-created",
        leadId: "lead-1",
        actorId: null,
        actorRole: null,
        kind: "lead_created" as const,
        title: "Lead creado",
        description: null,
        metadata: {},
        dedupeKey: "lead_created:lead-1",
        occurredAt,
        createdAt: occurredAt,
        actorName: null,
        reconstructed: false,
      },
    ]);

    expect(merged.filter((event) => event.kind === "lead_created")).toHaveLength(1);
    expect(merged.map((event) => event.kind)).toContain("alert_resolved");
  });

  it("orders dated events newest first and keeps unknown legacy dates last", () => {
    const events = buildLegacyLeadActivity({
      lead: {
        id: "lead-1",
        createdAt: new Date("2026-08-01T10:00:00Z"),
        updatedAt: new Date("2026-08-03T12:00:00Z"),
        callerId: null,
        closerId: null,
        questions: [
          {
            questionKey: "appointmentHistory",
            question: "Historial de agenda",
            answer: '[{"date":"2026-08-10","time":"10:00"}]',
            authorRole: "caller",
            authorId: "caller-1",
          },
        ],
      },
      alerts: [],
    });

    const merged = mergeLeadActivity(events);
    expect(merged[0]?.kind).toBe("lead_created");
    expect(merged.at(-1)?.kind).toBe("appointment_scheduled");
  });
});
