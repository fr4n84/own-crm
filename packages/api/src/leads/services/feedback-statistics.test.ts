import { describe, expect, it } from "vitest";

import {
  buildAttributionFunnels,
  buildFeedbackStatistics,
  buildLegacyFeedbackRows,
} from "./feedback-statistics";

function feedback({
  outcome,
  profile,
  subProfile = "",
  angles = [],
  source,
  campaign,
  actorId = "caller-1",
  actorName = "Caller 1",
  actorRole = "caller",
  activitySource,
}: {
  outcome: string;
  profile?: string;
  subProfile?: string;
  angles?: string[];
  source?: string;
  campaign?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  activitySource?: string;
}) {
  return {
    leadId: crypto.randomUUID(),
    leadName: "Lead de prueba",
    actorId,
    actorName,
    actorRole,
    source: source ?? null,
    campaign: campaign ?? null,
    description: outcome,
    occurredAt: new Date("2026-08-10T10:00:00.000Z"),
    metadata: {
      ...(activitySource ? { activitySource } : {}),
      questions: [
        ...(profile
          ? [{ questionKey: "primaryProfile", answer: profile }]
          : []),
        { questionKey: "subProfile", answer: subProfile },
        { questionKey: "motivationAngles", answer: JSON.stringify(angles) },
      ],
    },
  };
}

describe("feedback statistics", () => {
  it("keeps CSV snapshots separate and exposes their raw feedback as inherited data", () => {
    const rows = buildLegacyFeedbackRows([
      {
        id: "legacy-1",
        name: "Lead heredado",
        callerId: "caller-1",
        callerName: "Caller 1",
        source: null,
        campaign: null,
        feedback: "Pidió información y quedó agendado",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        questions: [
          { questionKey: "csvSourceState", question: "Origen", answer: "Asignado", authorRole: "caller", authorId: null },
          { questionKey: "callerOutcome", question: "Resultado", answer: "Agenda", authorRole: "caller", authorId: null },
        ],
      },
      {
        id: "exact-1",
        name: "Lead con evento",
        callerId: "caller-1",
        callerName: "Caller 1",
        source: null,
        campaign: null,
        feedback: "No debe duplicarse",
        createdAt: new Date("2026-08-02T10:00:00.000Z"),
        questions: [{ questionKey: "csvSourceState", question: "Origen", answer: "Asignado", authorRole: "caller", authorId: null }],
      },
    ], new Set(["exact-1"]));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      leadId: "legacy-1",
      description: "Agenda",
      metadata: { dataOrigin: "legacy_csv_snapshot" },
    });
    expect(buildFeedbackStatistics(rows).feedbacks[0]).toMatchObject({
      summary: "Pidió información y quedó agendado",
    });
  });

  it("groups every historical feedback by profile, subprofile, angle and reaction", () => {
    const result = buildFeedbackStatistics([
      feedback({
        outcome: "Agenda",
        profile: "latino_extranjero",
        subProfile: "parado_desempleado",
        angles: ["income_extra_to_primary"],
        source: "Meta Ads",
        campaign: "VSL Agosto",
      }),
      feedback({
        outcome: "No interesado",
        profile: "latino_extranjero",
        subProfile: "mayor_edad_avanzada",
        angles: ["financial_stability"],
        source: "Meta Ads",
        campaign: "VSL Agosto",
      }),
      feedback({
        outcome: "Llamar a futuro",
        profile: "mayor_edad_avanzada",
        angles: ["financial_stability"],
        source: "YouTube",
        campaign: "Orgánico",
      }),
      feedback({ outcome: "No encaja" }),
    ]);

    expect(result.totalFeedbacks).toBe(4);
    expect(result.classifiedFeedbacks).toBe(3);
    expect(result.appointmentRate).toBeCloseTo(33.3, 1);
    expect(result.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: "latino_extranjero",
          total: 2,
          reactions: expect.objectContaining({
            appointment: 1,
            not_interested: 1,
          }),
          subProfiles: expect.arrayContaining([
            expect.objectContaining({ profile: "parado_desempleado", total: 1 }),
            expect.objectContaining({ profile: "mayor_edad_avanzada", total: 1 }),
          ]),
        }),
      ]),
    );
    expect(result.angles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ angle: "financial_stability", total: 2 }),
      ]),
    );
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Meta Ads", total: 2, appointmentRate: 50 }),
      ]),
    );
    expect(result.campaigns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "VSL Agosto", total: 2, appointmentRate: 50 }),
      ]),
    );
    expect(result.dataQuality).toMatchObject({
      missingProfile: { count: 1, percentage: 25 },
      missingSource: { count: 1, percentage: 25 },
      missingCampaign: { count: 1, percentage: 25 },
      missingOutcome: { count: 0, percentage: 0 },
    });
    expect(result.feedbacks[0]).toMatchObject({
      leadName: "Lead de prueba",
      source: "Meta Ads",
      campaign: "VSL Agosto",
    });
  });

  it("excludes administrative edits from feedback, profiles, motivations and caller totals", () => {
    const result = buildFeedbackStatistics([
      feedback({ outcome: "Agenda", profile: "parado_desempleado", angles: ["financial_stability"] }),
      feedback({ outcome: "Agenda", profile: "latino_extranjero", angles: ["income_extra_to_primary"], actorId: "admin-1", actorName: "Admin", actorRole: "admin" }),
      feedback({ outcome: "Agenda", profile: "mayor_edad_avanzada", angles: ["freedom_time"], actorId: "admin-2", actorName: "Admin 2", activitySource: "administrative_qa_edit" }),
    ]);

    expect(result.totalFeedbacks).toBe(1);
    expect(result.feedbacks).toHaveLength(1);
    expect(result.profiles.map(({ profile }) => profile)).toEqual(["parado_desempleado"]);
    expect(result.angles.map(({ angle }) => angle)).toEqual(["financial_stability"]);
    expect(result.callers).toEqual([{ id: "caller-1", name: "Caller 1", total: 1 }]);
  });

  it("builds received-to-sale funnels by source and campaign", () => {
    const createdAt = new Date("2026-08-01T10:00:00.000Z");
    const event = (id: string, kind: string, description: string, minute: number) => ({
      id,
      kind,
      description,
      metadata: {},
      occurredAt: new Date(createdAt.getTime() + minute * 60_000),
    });
    const result = buildAttributionFunnels([
      {
        id: "sale-lead",
        name: "Sale Lead",
        email: "sale@example.com",
        phone: "600000001",
        type: "maestra",
        callerId: "caller-1",
        callerName: "Caller 1",
        closerId: "closer-1",
        closerName: "Closer 1",
        createdAt,
        source: "Meta Ads",
        campaign: "VSL Agosto",
        events: [
          event("f1", "caller_feedback", "Agenda", 1),
          event("a1", "appointment_scheduled", "Agenda", 2),
          event("c1", "closer_feedback", "Venta", 3),
        ],
      },
      {
        id: "contacted-lead",
        name: "Contacted Lead",
        email: "contacted@example.com",
        phone: "600000002",
        type: "maestra",
        callerId: "caller-1",
        callerName: "Caller 1",
        closerId: null,
        closerName: null,
        createdAt,
        source: "Meta Ads",
        campaign: "VSL Agosto",
        events: [event("f2", "caller_feedback", "Llamar a futuro", 1)],
      },
    ]);

    expect(result.sources[0]).toMatchObject({
      value: "Meta Ads",
      totalConversion: 50,
      stages: {
        received: { count: 2 },
        contacted: { count: 2 },
        appointment: { count: 1 },
        show: { count: 1 },
        sale: { count: 1 },
      },
    });
    expect(result.campaigns[0]?.stages.sale.leads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "sale-lead", name: "Sale Lead" }),
      ]),
    );
  });
});
