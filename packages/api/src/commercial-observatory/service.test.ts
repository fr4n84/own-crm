import { describe, expect, it } from "vitest";

import { buildAsOfCases, type CohortActivity } from "../commercial-evidence/cohort";
import { buildObservatoryObservations } from "./service";

describe("commercial observatory server-owned observations", () => {
  it("freezes attribution and confirmed profile at assignment time and keeps one row per lead", () => {
    const assignedAt = new Date("2026-01-10T10:00:00Z");
    const activities: CohortActivity[] = [
      { id: "created", leadId: "private", kind: "lead_created", occurredAt: new Date("2026-01-01T10:00:00Z"), description: null, metadata: { source: "Meta", campaign: "Original" } },
      { id: "feedback", leadId: "private", kind: "caller_feedback", occurredAt: new Date("2026-01-05T10:00:00Z"), description: null, metadata: { questions: [{ questionKey: "primaryProfile", answer: "parado_desempleado" }] } },
      { id: "assignment", leadId: "private", kind: "caller_assigned", occurredAt: assignedAt, description: null, metadata: { userId: "caller-a" } },
      { id: "late-attribution", leadId: "private", kind: "lead_attribution_updated", occurredAt: new Date("2026-02-01T10:00:00Z"), description: null, metadata: { after: { source: "Organic", campaign: "Future" } } },
      { id: "reassignment", leadId: "private", kind: "caller_assigned", occurredAt: new Date("2026-02-05T10:00:00Z"), description: null, metadata: { userId: "caller-b" } },
    ];
    const asOf = new Date("2026-03-01T00:00:00Z");
    const shuffled = [activities[4]!, activities[2]!, activities[0]!, activities[3]!, activities[1]!];
    const cases = buildAsOfCases({ leads: [{ id: "private", type: "maestra", createdAt: new Date("2026-01-01T10:00:00Z") }], activities: shuffled, financial: [], asOf });
    const rows = buildObservatoryObservations({ cases, activities: shuffled, financial: [], asOf });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "Meta", campaign: "Original", profile: "parado_desempleado", callerId: "caller-a" });
  });

  it("uses a stable id tie-breaker for attribution events at the same instant", () => {
    const instant = new Date("2026-01-01T10:00:00Z");
    const activities: CohortActivity[] = [
      { id: "z-update", leadId: "lead", kind: "lead_attribution_updated", occurredAt: instant, description: null, metadata: { after: { source: "Final" } } },
      { id: "a-created", leadId: "lead", kind: "lead_created", occurredAt: instant, description: null, metadata: { source: "Initial" } },
    ];
    const cases = buildAsOfCases({ leads: [{ id: "lead", type: "maestra", createdAt: instant }], activities, financial: [], asOf: new Date("2026-02-01T00:00:00Z") });
    const forward = buildObservatoryObservations({ cases, activities, financial: [], asOf: new Date("2026-02-01T00:00:00Z") });
    const reversed = buildObservatoryObservations({ cases, activities: [...activities].reverse(), financial: [], asOf: new Date("2026-02-01T00:00:00Z") });
    expect(forward[0]?.source).toBe("Final");
    expect(reversed).toEqual(forward);
  });
});
