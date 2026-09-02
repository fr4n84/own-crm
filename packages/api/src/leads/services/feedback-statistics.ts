import { alias, and, asc, db, eq, gte, inArray, lte } from "@crm-fran/db";
import {
  LEAD_ACTIVITY_KIND,
  leadActivityEvents,
  leads,
  user,
  type LeadQASession,
} from "@crm-fran/db/schema/index";

import type { FeedbackProfile, MotivationAngle } from "../../call-feedback";
import { FEEDBACK_PROFILES, MOTIVATION_ANGLES } from "../../call-feedback";
import { classifyConversionLead } from "../../dashboard/conversion-funnel";
import { parseConfirmedFacts } from "../../commercial-evidence/facts";
import { isAdministrativeFeedbackEvent } from "../../lead-feedback-events";
import {
  buildCallerQualityRanking,
  selectCallerQualityRanking,
} from "./caller-quality-ranking";

export type FeedbackReaction = "appointment" | "future_call" | "not_interested" | "not_fit" | "unknown";

type FeedbackRow = {
  actorId: string | null;
  actorName: string | null;
  actorRole?: string | null;
  leadId: string;
  leadName: string;
  source: string | null;
  campaign: string | null;
  description: string | null;
  occurredAt: Date;
  metadata: Record<string, unknown>;
};

type FeedbackStatisticsInput = {
  callerId?: string;
  source?: string;
  campaign?: string;
  from?: string;
  to?: string;
};

type LegacyFeedbackLead = {
  id: string;
  name: string;
  callerId: string | null;
  callerName: string | null;
  source: string | null;
  campaign: string | null;
  feedback: string;
  createdAt: Date;
  questions: LeadQASession;
};

const REACTION_BY_OUTCOME: Record<string, FeedbackReaction> = {
  Agenda: "appointment",
  "Llamar a futuro": "future_call",
  "No interesado": "not_interested",
  "No encaja": "not_fit",
};
const profileValues = new Set<string>(FEEDBACK_PROFILES.map(({ value }) => value));
const angleValues = new Set<string>(MOTIVATION_ANGLES.map(({ value }) => value));

const LEGACY_REACTION_BY_IMPACT: Record<string, string> = {
  "Agenda llamada": "Agenda",
  Reagendado: "Agenda",
  "Llamar futuro": "Llamar a futuro",
  "No interesad@": "No interesado",
  "No encaja": "No encaja",
};

function latestAnswer(questions: LeadQASession, key: string) {
  return [...questions].reverse().find((question) => question.questionKey === key)?.answer;
}

export function buildLegacyFeedbackRows(
  leadRows: readonly LegacyFeedbackLead[],
  exactFeedbackLeadIds: ReadonlySet<string>,
): FeedbackRow[] {
  return leadRows.flatMap((lead) => {
    if (exactFeedbackLeadIds.has(lead.id)) return [];
    if (!latestAnswer(lead.questions, "csvSourceState")) return [];
    const outcome = latestAnswer(lead.questions, "callerOutcome")
      ?? LEGACY_REACTION_BY_IMPACT[latestAnswer(lead.questions, "csvImpactOutcome") ?? ""]
      ?? null;
    const questions = [
      ...lead.questions,
      {
        questionKey: "summary",
        question: "Feedback heredado del CSV",
        answer: lead.feedback === "sin asignar" ? "" : lead.feedback,
        authorRole: "caller" as const,
        authorId: lead.callerId,
      },
    ];
    return [{
      leadId: lead.id,
      leadName: lead.name,
      actorId: lead.callerId,
      actorName: lead.callerName,
      actorRole: "caller",
      source: lead.source,
      campaign: lead.campaign,
      description: outcome,
      occurredAt: lead.createdAt,
      metadata: {
        dataOrigin: "legacy_csv_snapshot",
        dateBasis: "lead_created_at",
        questions,
      },
    }];
  });
}

function emptyReactions(): Record<FeedbackReaction, number> {
  return { appointment: 0, future_call: 0, not_interested: 0, not_fit: 0, unknown: 0 };
}

function readAnswers(metadata: Record<string, unknown>) {
  const questions = Array.isArray(metadata.questions) ? metadata.questions : [];
  return new Map(
    questions.flatMap((question) => {
      if (!question || typeof question !== "object") return [];
      const { questionKey, answer } = question as Record<string, unknown>;
      return typeof questionKey === "string" && typeof answer === "string"
        ? [[questionKey, answer] as const]
        : [];
    }),
  );
}

function readAngles(answer: string | undefined): MotivationAngle[] {
  if (!answer) return [];
  try {
    const values: unknown = JSON.parse(answer);
    return Array.isArray(values)
      ? values.filter((value): value is MotivationAngle => typeof value === "string" && angleValues.has(value))
      : [];
  } catch {
    return [];
  }
}

function aggregateAttribution(
  rows: readonly FeedbackRow[],
  selectValue: (row: FeedbackRow) => string | null,
) {
  const groups = new Map<
    string,
    { value: string; total: number; reactions: Record<FeedbackReaction, number> }
  >();

  for (const row of rows) {
    const value = selectValue(row)?.trim();
    if (!value) continue;
    const reaction = REACTION_BY_OUTCOME[row.description ?? ""] ?? "unknown";
    const group = groups.get(value) ?? {
      value,
      total: 0,
      reactions: emptyReactions(),
    };
    group.total += 1;
    group.reactions[reaction] += 1;
    groups.set(value, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      appointmentRate:
        group.total === 0
          ? 0
          : Math.round((group.reactions.appointment / group.total) * 1_000) / 10,
    }))
    .sort((a, b) => b.total - a.total);
}

function qualityMetric(count: number, total: number) {
  return {
    count,
    percentage: total === 0 ? 0 : Math.round((count / total) * 1_000) / 10,
  };
}

type AttributionFunnelLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  type: "maestra" | "vsl";
  callerId: string | null;
  closerId: string | null;
  createdAt: Date;
  source: string | null;
  campaign: string | null;
  events: Array<{
    id: string;
    kind: string;
    description: string | null;
    metadata: Record<string, unknown>;
    occurredAt: Date;
  }>;
};

const FUNNEL_STAGE_KEYS = [
  "received",
  "contacted",
  "appointment",
  "show",
  "sale",
] as const;
type AttributionStage = (typeof FUNNEL_STAGE_KEYS)[number];

function buildAttributionGroup(
  value: string,
  leadsForGroup: readonly AttributionFunnelLead[],
) {
  const stageLeads: Record<
    AttributionStage,
    Array<Omit<AttributionFunnelLead, "events">>
  > = {
    received: [],
    contacted: [],
    appointment: [],
    show: [],
    sale: [],
  };

  for (const lead of leadsForGroup) {
    const { events: _events, ...summary } = lead;
    const classification = classifyConversionLead({
      ...lead,
      callerId: lead.callerId ?? "",
      callerName: null,
      closerName: null,
      assignedAt: lead.createdAt,
    });
    stageLeads.received.push(summary);
    if (classification.contacted) stageLeads.contacted.push(summary);
    if (classification.appointment) stageLeads.appointment.push(summary);
    if (classification.show) stageLeads.show.push(summary);
    if (classification.sale) stageLeads.sale.push(summary);
  }

  const stages = Object.fromEntries(
    FUNNEL_STAGE_KEYS.map((stage, index) => {
      const count = stageLeads[stage].length;
      const previousStage = FUNNEL_STAGE_KEYS[index - 1];
      const previousCount = previousStage
        ? stageLeads[previousStage].length
        : count;
      return [
        stage,
        {
          count,
          previousConversion:
            index === 0 || previousCount === 0
              ? index === 0 ? 100 : 0
              : Math.round((count / previousCount) * 1_000) / 10,
          leads: stageLeads[stage],
        },
      ];
    }),
  ) as Record<
    AttributionStage,
    { count: number; previousConversion: number; leads: Array<Omit<AttributionFunnelLead, "events">> }
  >;

  return {
    value,
    stages,
    totalConversion:
      stages.received.count === 0
        ? 0
        : Math.round((stages.sale.count / stages.received.count) * 1_000) / 10,
  };
}

export function buildAttributionFunnels(leadsInput: readonly AttributionFunnelLead[]) {
  const groupBy = (selectValue: (lead: AttributionFunnelLead) => string | null) => {
    const groups = new Map<string, AttributionFunnelLead[]>();
    for (const lead of leadsInput) {
      const value = selectValue(lead)?.trim();
      if (!value) continue;
      const group = groups.get(value) ?? [];
      group.push(lead);
      groups.set(value, group);
    }
    return [...groups]
      .map(([value, groupedLeads]) => buildAttributionGroup(value, groupedLeads))
      .sort((first, second) => second.stages.received.count - first.stages.received.count);
  };

  return {
    sources: groupBy((lead) => lead.source),
    campaigns: groupBy((lead) => lead.campaign),
  };
}

export function buildFeedbackStatistics(rows: readonly FeedbackRow[]) {
  const feedbackRows = rows.filter((row) => !isAdministrativeFeedbackEvent({
    kind: "caller_feedback",
    actorRole: row.actorRole,
    metadata: row.metadata,
  }));
  const profiles = new Map<FeedbackProfile, {
    profile: FeedbackProfile;
    total: number;
    reactions: Record<FeedbackReaction, number>;
    subProfiles: Map<FeedbackProfile, { profile: FeedbackProfile; total: number }>;
  }>();
  const angles = new Map<MotivationAngle, {
    angle: MotivationAngle;
    total: number;
    reactions: Record<FeedbackReaction, number>;
  }>();
  const callers = new Map<string, { id: string; name: string; total: number }>();
  let classifiedFeedbacks = 0;
  let classifiedAppointments = 0;
  let missingProfile = 0;
  let missingSource = 0;
  let missingCampaign = 0;
  let missingOutcome = 0;
  const reactions = emptyReactions();
  const feedbacks = [];

  for (const row of feedbackRows) {
    const reaction = REACTION_BY_OUTCOME[row.description ?? ""] ?? "unknown";
    reactions[reaction] += 1;
    const answers = readAnswers(row.metadata);
    const facts = parseConfirmedFacts([...answers].map(([questionKey, answer]) => ({ questionKey, answer })));
    const profile = facts.primaryProfile.kind === "value" && profileValues.has(facts.primaryProfile.value)
      ? (facts.primaryProfile.value as FeedbackProfile)
      : undefined;
    if (!profile) missingProfile += 1;
    if (!row.source?.trim()) missingSource += 1;
    if (!row.campaign?.trim()) missingCampaign += 1;
    if (reaction === "unknown") missingOutcome += 1;

    if (profile) {
      classifiedFeedbacks += 1;
      if (reaction === "appointment") classifiedAppointments += 1;
      const entry = profiles.get(profile) ?? {
        profile,
        total: 0,
        reactions: emptyReactions(),
        subProfiles: new Map(),
      };
      entry.total += 1;
      entry.reactions[reaction] += 1;
      const subProfileAnswer = facts.subProfile.kind === "value" ? facts.subProfile.value : undefined;
      if (subProfileAnswer && profileValues.has(subProfileAnswer)) {
        const subProfile = subProfileAnswer as FeedbackProfile;
        const subEntry = entry.subProfiles.get(subProfile) ?? { profile: subProfile, total: 0 };
        subEntry.total += 1;
        entry.subProfiles.set(subProfile, subEntry);
      }
      profiles.set(profile, entry);
    }

    for (const angle of readAngles(answers.get("motivationAngles"))) {
      const entry = angles.get(angle) ?? { angle, total: 0, reactions: emptyReactions() };
      entry.total += 1;
      entry.reactions[reaction] += 1;
      angles.set(angle, entry);
    }

    if (row.actorId) {
      const caller = callers.get(row.actorId) ?? { id: row.actorId, name: row.actorName ?? "Sin nombre", total: 0 };
      caller.total += 1;
      callers.set(row.actorId, caller);
    }

    feedbacks.push({
      leadId: row.leadId,
      leadName: row.leadName,
      callerId: row.actorId,
      callerName: row.actorName,
      source: row.source,
      campaign: row.campaign,
      outcome: row.description,
      profile: profile ?? null,
      angles: readAngles(answers.get("motivationAngles")),
      summary: answers.get("summary") ?? "",
      occurredAt: row.occurredAt,
      dataOrigin: row.metadata.dataOrigin === "legacy_csv_snapshot"
        ? "legacy_csv_snapshot" as const
        : "exact_activity" as const,
    });
  }

  return {
    totalFeedbacks: feedbackRows.length,
    classifiedFeedbacks,
    appointmentRate: classifiedFeedbacks === 0 ? 0 : Math.round((classifiedAppointments / classifiedFeedbacks) * 1_000) / 10,
    reactions,
    profiles: [...profiles.values()]
      .map(({ subProfiles, ...entry }) => ({ ...entry, subProfiles: [...subProfiles.values()].sort((a, b) => b.total - a.total) }))
      .sort((a, b) => b.total - a.total),
    angles: [...angles.values()].sort((a, b) => b.total - a.total),
    sources: aggregateAttribution(feedbackRows, (row) => row.source),
    campaigns: aggregateAttribution(feedbackRows, (row) => row.campaign),
    dataQuality: {
      missingProfile: qualityMetric(missingProfile, feedbackRows.length),
      missingSource: qualityMetric(missingSource, feedbackRows.length),
      missingCampaign: qualityMetric(missingCampaign, feedbackRows.length),
      missingOutcome: qualityMetric(missingOutcome, feedbackRows.length),
    },
    feedbacks,
    callers: [...callers.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function startOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function endOfDay(value: string) {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export async function getFeedbackStatistics(input: FeedbackStatisticsInput) {
  const rankingCaller = alias(user, "feedback_ranking_caller");
  const rankingCloser = alias(user, "feedback_ranking_closer");
  const legacyCaller = alias(user, "feedback_legacy_caller");
  const [rows, funnelLeadRows, rankingAssignmentRows, legacyLeadRows] = await Promise.all([
    db
    .select({
      leadId: leadActivityEvents.leadId,
      leadName: leads.name,
      actorId: leadActivityEvents.actorId,
      actorName: user.name,
      actorRole: leadActivityEvents.actorRole,
      source: leads.source,
      campaign: leads.campaign,
      description: leadActivityEvents.description,
      metadata: leadActivityEvents.metadata,
      occurredAt: leadActivityEvents.occurredAt,
    })
    .from(leadActivityEvents)
    .leftJoin(user, eq(leadActivityEvents.actorId, user.id))
    .innerJoin(leads, eq(leadActivityEvents.leadId, leads.id))
    .where(and(
      eq(leadActivityEvents.kind, "caller_feedback"),
      input.from ? gte(leadActivityEvents.occurredAt, startOfDay(input.from)) : undefined,
      input.to ? lte(leadActivityEvents.occurredAt, endOfDay(input.to)) : undefined,
    ))
    .orderBy(asc(leadActivityEvents.occurredAt)),
    db
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        type: leads.type,
        callerId: leads.callerId,
        closerId: leads.closerId,
        createdAt: leads.createdAt,
        source: leads.source,
        campaign: leads.campaign,
      })
      .from(leads)
      .where(and(
        input.from ? gte(leads.createdAt, startOfDay(input.from)) : undefined,
        input.to ? lte(leads.createdAt, endOfDay(input.to)) : undefined,
      )),
    db
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        type: leads.type,
        callerId: leadActivityEvents.actorId,
        callerName: rankingCaller.name,
        closerId: leads.closerId,
        closerName: rankingCloser.name,
        assignedAt: leadActivityEvents.occurredAt,
        source: leads.source,
        campaign: leads.campaign,
      })
      .from(leadActivityEvents)
      .innerJoin(leads, eq(leads.id, leadActivityEvents.leadId))
      .leftJoin(rankingCaller, eq(rankingCaller.id, leadActivityEvents.actorId))
      .leftJoin(rankingCloser, eq(rankingCloser.id, leads.closerId))
      .where(and(
        eq(leadActivityEvents.kind, LEAD_ACTIVITY_KIND.CALLER_ASSIGNED),
        input.from ? gte(leadActivityEvents.occurredAt, startOfDay(input.from)) : undefined,
        input.to ? lte(leadActivityEvents.occurredAt, endOfDay(input.to)) : undefined,
        input.source ? eq(leads.source, input.source) : undefined,
        input.campaign ? eq(leads.campaign, input.campaign) : undefined,
      ))
      .orderBy(asc(leadActivityEvents.occurredAt)),
    db
      .select({
        id: leads.id,
        name: leads.name,
        callerId: leads.callerId,
        callerName: legacyCaller.name,
        source: leads.source,
        campaign: leads.campaign,
        feedback: leads.feedback,
        createdAt: leads.createdAt,
        questions: leads.questions,
      })
      .from(leads)
      .leftJoin(legacyCaller, eq(legacyCaller.id, leads.callerId))
      .where(and(
        input.from ? gte(leads.createdAt, startOfDay(input.from)) : undefined,
        input.to ? lte(leads.createdAt, endOfDay(input.to)) : undefined,
      )),
  ]);

  const allStatistics = buildFeedbackStatistics(rows);
  const filteredStatistics = buildFeedbackStatistics(rows.filter((row) => {
    if (input.callerId && row.actorId !== input.callerId) return false;
    if (input.source && row.source !== input.source) return false;
    if (input.campaign && row.campaign !== input.campaign) return false;
    return true;
  }));
  const legacyRows = buildLegacyFeedbackRows(
    legacyLeadRows,
    new Set(rows.map((row) => row.leadId)),
  );
  const allLegacyStatistics = buildFeedbackStatistics(legacyRows);
  const filteredLegacyStatistics = buildFeedbackStatistics(legacyRows.filter((row) => {
    if (input.callerId && row.actorId !== input.callerId) return false;
    if (input.source && row.source !== input.source) return false;
    if (input.campaign && row.campaign !== input.campaign) return false;
    return true;
  }));
  const filteredFunnelLeadRows = funnelLeadRows.filter((lead) => {
    if (input.callerId && lead.callerId !== input.callerId) return false;
    if (input.source && lead.source !== input.source) return false;
    if (input.campaign && lead.campaign !== input.campaign) return false;
    return true;
  });
  const usableRankingAssignments = rankingAssignmentRows.filter(
    (row): row is typeof row & { callerId: string } => Boolean(row.callerId),
  );
  const activityLeadIds = [
    ...new Set([
      ...filteredFunnelLeadRows.map(({ id }) => id),
      ...usableRankingAssignments.map(({ id }) => id),
    ]),
  ];
  const activityRows = activityLeadIds.length === 0
    ? []
    : await db
        .select({
          id: leadActivityEvents.id,
          leadId: leadActivityEvents.leadId,
          kind: leadActivityEvents.kind,
          description: leadActivityEvents.description,
          actorRole: leadActivityEvents.actorRole,
          metadata: leadActivityEvents.metadata,
          occurredAt: leadActivityEvents.occurredAt,
        })
        .from(leadActivityEvents)
        .where(inArray(leadActivityEvents.leadId, activityLeadIds))
        .orderBy(asc(leadActivityEvents.occurredAt));
  const eventsByLead = new Map<string, AttributionFunnelLead["events"]>();
  for (const event of activityRows) {
    const events = eventsByLead.get(event.leadId) ?? [];
    events.push(event);
    eventsByLead.set(event.leadId, events);
  }
  const funnels = buildAttributionFunnels(
    filteredFunnelLeadRows.map((lead) => ({
      ...lead,
      events: eventsByLead.get(lead.id) ?? [],
    })),
  );
  const callerQuality = selectCallerQualityRanking(
    buildCallerQualityRanking(
      usableRankingAssignments.map((assignment) => {
        const events = eventsByLead.get(assignment.id) ?? [];
        const nextAssignment = events.find(
          (event) =>
            event.kind === LEAD_ACTIVITY_KIND.CALLER_ASSIGNED &&
            event.occurredAt > assignment.assignedAt,
        );
        return {
          ...assignment,
          assignmentEndedAt: nextAssignment?.occurredAt ?? null,
          events,
        };
      }),
    ),
    input.callerId,
  );
  const availableSources = [...new Set(funnelLeadRows.flatMap((lead) => lead.source ? [lead.source] : []))].sort();
  const availableCampaigns = [...new Set(funnelLeadRows.flatMap((lead) => lead.campaign ? [lead.campaign] : []))].sort();

  return {
    ...filteredStatistics,
    callers: [...new Map(
      [...allStatistics.callers, ...allLegacyStatistics.callers].map((caller) => [caller.id, caller]),
    ).values()].sort((first, second) => first.name.localeCompare(second.name)),
    availableSources,
    availableCampaigns,
    funnels,
    callerQuality,
    legacy: {
      ...filteredLegacyStatistics,
      dataOrigin: "legacy_csv_snapshot" as const,
      dateBasis: "lead_created_at" as const,
    },
  };
}
