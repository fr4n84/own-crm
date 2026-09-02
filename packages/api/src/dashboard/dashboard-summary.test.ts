import { describe, expect, it } from "vitest";

import {
  buildDashboardSummary,
  normalizeDashboardSummaryRange,
} from "./dashboard-summary";

const at = (value: string) => new Date(value);

describe("dashboard summary", () => {
  it("normalizes inclusive Madrid days to an exclusive DST-safe range", () => {
    expect(
      normalizeDashboardSummaryRange(
        { from: "2026-03-28", to: "2026-03-29" },
        at("2026-03-30T10:00:00.000Z"),
      ),
    ).toMatchObject({
      from: at("2026-03-27T23:00:00.000Z"),
      to: at("2026-03-29T22:00:00.000Z"),
      lastClosedDay: "2026-03-29",
    });

    expect(
      normalizeDashboardSummaryRange(
        { from: "2026-10-24", to: "2026-10-25" },
        at("2026-10-26T10:00:00.000Z"),
      ).to,
    ).toEqual(at("2026-10-25T23:00:00.000Z"));
  });

  it("deduplicates leads and excludes administrative feedback from activity metrics", () => {
    const result = buildDashboardSummary({
      createdLeadIds: ["lead-1", "lead-1", "lead-2"],
      events: [
        { leadId: "lead-1", kind: "caller_feedback", actorRole: "caller", description: "Agenda", metadata: {} },
        { leadId: "lead-1", kind: "caller_feedback", actorRole: "caller", description: "Agenda", metadata: {} },
        { leadId: "lead-2", kind: "caller_feedback", actorRole: "admin", description: "Agenda", metadata: { activitySource: "administrative_qa_edit" } },
        { leadId: "lead-1", kind: "appointment_scheduled", actorRole: "caller", description: null, metadata: {} },
        { leadId: "lead-1", kind: "appointment_rescheduled", actorRole: "caller", description: null, metadata: {} },
        { leadId: "lead-1", kind: "closer_feedback", actorRole: "closer", description: "Venta", metadata: {} },
        { leadId: "lead-2", kind: "closer_feedback", actorRole: "admin", description: "Venta", metadata: {} },
      ],
    });

    expect(result).toEqual({ leads: 2, contacted: 1, appointments: 1, sales: 1 });
  });
});
