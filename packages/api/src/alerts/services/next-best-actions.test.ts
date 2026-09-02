import { describe, expect, it } from "vitest";

import { availableNextBestActionModes, buildNextBestActions } from "./next-best-actions";

const now = new Date("2026-08-22T12:00:00.000Z");
const lead = (id: string, name: string) => ({
  id,
  name,
  caller: { id: "caller-1", name: "Caller" },
});

describe("next best actions", () => {
  it("only exposes work modes the authenticated role can exercise", () => {
    expect(availableNextBestActionModes({ roleId: "role-caller", permissions: ["alerts:read"] })).toEqual(["caller"]);
    expect(availableNextBestActionModes({ roleId: "role-closer", permissions: ["alerts:read"] })).toEqual(["closer"]);
    expect(availableNextBestActionModes({ roleId: "role-admin", permissions: ["*"] })).toEqual(["caller", "closer"]);
    expect(availableNextBestActionModes({ roleId: "role-caller", permissions: ["alerts:read"], ownsCloserWork: true })).toEqual(["caller", "closer"]);
  });

  it("filters the queue using the real caller and closer action taxonomies", () => {
    const callerLead = lead("caller", "Caller lead");
    const closerLead = { ...lead("closer", "Closer lead"), closer: { id: "closer-1", name: "Closer" } };
    const saleLead = { ...lead("sale", "Sale lead"), closer: { id: "closer-1", name: "Closer" } };
    const alerts = [
      { id: "call", lead: callerLead, targetUser: { roleId: "role-caller" }, kind: "future_call", severity: "info", message: "Llamar", nextShowAt: now },
      { id: "agenda", lead: closerLead, targetUser: { roleId: "role-closer" }, kind: "appointment", severity: "info", message: "Revisar agenda", nextShowAt: now },
      { id: "sale", lead: saleLead, targetUser: { roleId: "role-closer" }, kind: "sale", severity: "info", message: "Registrar venta", nextShowAt: now },
    ];

    expect(buildNextBestActions({ now, alerts, riskItems: [], mode: "caller" }).map(({ actionType }) => actionType)).toEqual(["future_call"]);
    expect(buildNextBestActions({ now, alerts, riskItems: [], mode: "closer" }).map(({ actionType }) => actionType).sort()).toEqual(["appointment", "sale"]);
  });

  it.each(["no_contact", "follow_up", "rescheduled"])(
    "keeps closer %s work out of Caller mode and isolated to its assigned closer",
    (kind) => {
      const closerLead = {
        ...lead("closer-owned", "Closer owned"),
        callerId: "caller-1",
        closerId: "closer-1",
        closer: { id: "closer-1", name: "Closer" },
      };
      const otherCloserLead = {
        ...lead("other-closer", "Other closer"),
        callerId: "caller-1",
        closerId: "closer-2",
        closer: { id: "closer-2", name: "Other closer" },
      };
      const alerts = [
        {
          id: "own",
          lead: closerLead,
          targetUserId: "closer-1",
          kind,
          severity: "info",
          message: "Trabajo del closer",
          nextShowAt: now,
        },
        {
          id: "other",
          lead: otherCloserLead,
          targetUserId: "closer-2",
          kind,
          severity: "info",
          message: "Trabajo de otro closer",
          nextShowAt: now,
        },
      ];

      expect(
        buildNextBestActions({ now, alerts, riskItems: [], mode: "caller" }),
      ).toEqual([]);
      expect(
        buildNextBestActions({ now, alerts: [alerts[0]!], riskItems: [], mode: "closer" }),
      ).toMatchObject([
        {
          lead: { id: "closer-owned" },
          actionType: kind,
          workMode: "closer",
          scheduledAt: now,
        },
      ]);
    },
  );
  it("puts an overdue scheduled call before ordinary risk work", () => {
    const futureLead = lead("future", "Future lead");
    const riskLead = lead("risk", "Risk lead");

    const actions = buildNextBestActions({
      now,
      alerts: [
        {
          id: "alert-1",
          lead: futureLead,
          kind: "future_call",
          severity: "info",
          message: "Llamar a futuro",
          nextShowAt: new Date("2026-08-22T11:00:00.000Z"),
        },
      ],
      riskItems: [
        {
          lead: riskLead,
          priority: "high",
          assignedAt: new Date("2026-08-22T08:00:00.000Z"),
          attemptCount: 1,
          lastAttemptAt: new Date("2026-08-22T10:00:00.000Z"),
          minutesSinceAssignment: 240,
          minutesSinceLastAttempt: 120,
        },
      ],
    });

    expect(actions.map(({ lead }) => lead.id)).toEqual(["future", "risk"]);
    expect(actions[0]).toMatchObject({
      actionType: "future_call",
      urgency: "critical",
      position: 1,
      recommendationKey: "alert:alert-1:2026-08-22T11:00:00.000Z",
      sourceAlertId: "alert-1",
    });
  });

  it("deduplicates a lead and keeps every reason used by the ranking", () => {
    const duplicatedLead = lead("same", "Same lead");

    const actions = buildNextBestActions({
      now,
      alerts: [
        {
          id: "alert-1",
          lead: duplicatedLead,
          kind: "follow_up",
          severity: "warning",
          message: "Seguimiento pendiente",
          nextShowAt: now,
        },
      ],
      riskItems: [
        {
          lead: duplicatedLead,
          priority: "critical",
          assignedAt: new Date("2026-08-21T11:00:00.000Z"),
          attemptCount: 2,
          lastAttemptAt: new Date("2026-08-22T02:00:00.000Z"),
          minutesSinceAssignment: 1_500,
          minutesSinceLastAttempt: 600,
        },
      ],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.reasons).toEqual([
      "Más de 24 horas sin contacto válido",
      "Seguimiento pendiente",
    ]);
    expect(actions[0]).toMatchObject({ actionType: "no_contact", score: 125 });
  });

  it("keeps future scheduled calls visible without letting distant ones dominate", () => {
    const actions = buildNextBestActions({
      now,
      alerts: [
        {
          id: "later",
          lead: lead("later", "Later"),
          kind: "future_call",
          severity: "info",
          message: "Llamar a futuro",
          nextShowAt: new Date("2026-08-24T12:00:00.000Z"),
        },
      ],
      riskItems: [
        {
          lead: lead("current", "Current"),
          priority: "low",
          assignedAt: new Date("2026-08-22T11:40:00.000Z"),
          attemptCount: 0,
          lastAttemptAt: null,
          minutesSinceAssignment: 20,
          minutesSinceLastAttempt: null,
        },
      ],
    });

    expect(actions.map(({ lead }) => lead.id)).toEqual(["current", "later"]);
    expect(actions[1]).toMatchObject({ urgency: "low" });
  });

  it("preserves contact context when a scheduled call becomes the primary action", () => {
    const sameLead = lead("same", "Same lead");
    const scheduledAt = new Date("2026-08-22T11:00:00.000Z");

    const actions = buildNextBestActions({
      now,
      alerts: [
        {
          id: "call",
          lead: sameLead,
          kind: "future_call",
          severity: "info",
          message: "Llamada programada",
          nextShowAt: scheduledAt,
        },
      ],
      riskItems: [
        {
          lead: sameLead,
          priority: "high",
          assignedAt: new Date("2026-08-22T07:00:00.000Z"),
          attemptCount: 3,
          lastAttemptAt: new Date("2026-08-22T10:30:00.000Z"),
          minutesSinceAssignment: 300,
          minutesSinceLastAttempt: 90,
        },
      ],
    });

    expect(actions[0]).toMatchObject({
      actionType: "future_call",
      attemptCount: 3,
      minutesSinceAssignment: 300,
      minutesSinceLastAttempt: 90,
      scheduledAt,
    });
  });

  it("temporarily removes a risk action immediately after a failed attempt", () => {
    const actions = buildNextBestActions({
      now,
      alerts: [],
      riskItems: [
        {
          lead: lead("recent", "Recent attempt"),
          priority: "high",
          assignedAt: new Date("2026-08-22T08:00:00.000Z"),
          attemptCount: 2,
          lastAttemptAt: new Date("2026-08-22T11:50:00.000Z"),
          minutesSinceAssignment: 240,
          minutesSinceLastAttempt: 10,
        },
      ],
    });

    expect(actions).toEqual([]);
  });
});

it("uses the assignment and last-attempt epoch in risk recommendation keys", () => {
  const action = buildNextBestActions({
    now,
    alerts: [],
    riskItems: [{ lead: lead("epoch", "Epoch"), priority: "high", assignedAt: new Date("2026-08-22T08:00:00.000Z"), lastAttemptAt: new Date("2026-08-22T10:00:00.000Z"), attemptCount: 1, minutesSinceAssignment: 240, minutesSinceLastAttempt: 120 }],
  })[0];
  expect(action?.recommendationKey).toBe("risk:epoch:2026-08-22T08:00:00.000Z:2026-08-22T10:00:00.000Z");
});


