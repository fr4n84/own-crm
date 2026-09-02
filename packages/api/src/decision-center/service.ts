import { TRPCError } from "@trpc/server";

import { and, asc, db, eq, inArray } from "@crm-fran/db";
import {
  commercialDecisionEvents,
  commercialDecisionWeeks,
  commercialDecisions,
  commercialExperiments,
  user,
  type CommercialDecisionPriority,
  type CommercialDecisionSource,
  type CommercialDecisionStatus,
} from "@crm-fran/db/schema/index";

import { getCommercialIntelligence } from "../commercial-intelligence/service";
import { getQualityControls } from "../dashboard/quality-controls-service";
import { profitabilityService } from "../profitability/service";
import {
  buildWeeklyDecisionCandidates,
  freezeQualityThresholds,
  madridCalendarDay,
  madridWeekBounds,
  nextDecisionStatus,
  profitabilityFingerprint,
  rankWeeklyDecisionCandidates,
  type DecisionAction,
  type DecisionSignal,
} from "./domain";

function priorityForCount(count: number): CommercialDecisionPriority {
  if (count >= 20) return "critical";
  if (count >= 10) return "high";
  if (count >= 3) return "medium";
  return "low";
}

async function collectSignals(weekStart: Date, weekEnd: Date, now: Date): Promise<DecisionSignal[]> {
  const effectiveEnd = now < weekEnd ? now : weekEnd;
  const [profitability, intelligence, quality, experiments] = await Promise.all([
    profitabilityService.overview({ from: weekStart, to: effectiveEnd }),
    getCommercialIntelligence({
      actorId: "decision-center",
      permissions: ["*"],
      from: weekStart,
      to: effectiveEnd,
    }),
    getQualityControls({
      from: madridCalendarDay(weekStart),
      to: madridCalendarDay(effectiveEnd),
      initializeSettings: false,
    }),
    db
      .select({
        id: commercialExperiments.id,
        name: commercialExperiments.name,
        hypothesis: commercialExperiments.hypothesis,
        finalDecision: commercialExperiments.finalDecision,
        finalDecisionNotes: commercialExperiments.finalDecisionNotes,
        finalDecisionAt: commercialExperiments.finalDecisionAt,
      })
      .from(commercialExperiments)
      .where(eq(commercialExperiments.status, "completed")),
  ]);

  const profitabilitySignals: DecisionSignal[] = profitability.campaigns
    .filter((campaign) =>
      ["increase", "reduce"].includes(campaign.suggestion.action),
    )
    .map((campaign) => ({
      sourceType: "profitability",
      sourceFingerprint: profitabilityFingerprint(
        campaign.source,
        campaign.campaign,
        campaign.suggestion.action,
      ),
      title:
        campaign.suggestion.action === "reduce"
          ? `Revisar inversión en ${campaign.campaign}`
          : `Evaluar escalado de ${campaign.campaign}`,
      summary: campaign.suggestion.reasons.join(" "),
      scope: `campaign:${campaign.source}:${campaign.campaign}`,
      priority:
        campaign.suggestion.action === "reduce" ? "critical" : "high",
      evidence: {
        source: campaign.source,
        campaign: campaign.campaign,
        action: campaign.suggestion.action,
        suggestedBudgetChangePercent:
          campaign.suggestion.suggestedBudgetChangePercent,
        spendCents: campaign.spendCents,
        sales: campaign.sales,
        roas: campaign.roas,
        methodology: profitability.methodology,
      },
      estimatedImpactCents:
        campaign.suggestion.action === "reduce"
          ? Math.round(
              (campaign.spendCents *
                Math.abs(campaign.suggestion.suggestedBudgetChangePercent)) /
                100,
            )
          : null,
      confidencePercent: null,
      sampleSize: campaign.leads,
    }));

  const leakageSignals: DecisionSignal[] = intelligence.leakage
    .filter((item) => item.count > 0)
    .map((item) => ({
      sourceType: "commercial_intelligence",
      sourceFingerprint: `commercial-intelligence:${item.key}`,
      title: `Resolver: ${item.label}`,
      summary: `${item.count} casos detectados esta semana. Revisar la evidencia antes de actuar.`,
      scope: "team",
      priority: priorityForCount(item.count),
      evidence: {
        key: item.key,
        count: item.count,
        estimatedMissedConversions: item.estimatedMissedConversions,
        estimatedRevenue: item.estimatedRevenue,
        observationalOnly: true,
      },
      estimatedImpactCents:
        item.estimatedRevenue === null
          ? null
          : Math.round(item.estimatedRevenue * 100),
      confidencePercent: null,
      sampleSize: item.count,
    }));

  const qualityGroups = [
    ["abandoned-caller", "Leads abandonados por callers", quality.abandoned.caller.length],
    ["abandoned-closer", "Leads abandonados por closers", quality.abandoned.closer.length],
    ["late-caller", "Seguimientos vencidos de callers", quality.lateFollowUps.caller.length],
    ["late-closer", "Seguimientos vencidos de closers", quality.lateFollowUps.closer.length],
    ["conversion-caller", "Conversión baja de callers", quality.lowConversion.caller.length],
    ["conversion-closer", "Conversión baja de closers", quality.lowConversion.closer.length],
  ] as const;
  const qualitySignals: DecisionSignal[] = qualityGroups
    .filter(([, , count]) => count > 0)
    .map(([key, title, count]) => ({
      sourceType: "quality_control",
      sourceFingerprint: `quality-control:${key}`,
      title,
      summary: `${count} incidencias requieren revisión humana.`,
      scope: "team",
      priority: priorityForCount(count),
      evidence: {
        key,
        count,
        thresholds: freezeQualityThresholds(quality.settings),
      },
      estimatedImpactCents: null,
      confidencePercent: null,
      sampleSize: count,
    }));

  const experimentSignals: DecisionSignal[] = experiments
    .filter(
      (experiment) =>
        experiment.finalDecision === "approved" &&
        experiment.finalDecisionAt &&
        experiment.finalDecisionAt >= weekStart &&
        experiment.finalDecisionAt <= effectiveEnd,
    )
    .map((experiment) => ({
      sourceType: "commercial_experiment",
      sourceFingerprint: `commercial-experiment:${experiment.id}:approved`,
      title: `Decidir despliegue de ${experiment.name}`,
      summary:
        experiment.finalDecisionNotes ??
        "El experimento fue aprobado; revisar su alcance antes de desplegarlo.",
      scope: "global",
      priority: "high",
      evidence: {
        experimentId: experiment.id,
        hypothesis: experiment.hypothesis,
        finalDecision: experiment.finalDecision,
        finalDecisionAt: experiment.finalDecisionAt?.toISOString() ?? null,
      },
      estimatedImpactCents: null,
      confidencePercent: null,
      sampleSize: null,
    }));

  return buildWeeklyDecisionCandidates([
    ...profitabilitySignals,
    ...leakageSignals,
    ...qualitySignals,
    ...experimentSignals,
  ]);
}

type DecisionRow = typeof commercialDecisions.$inferSelect;
type EventRow = typeof commercialDecisionEvents.$inferSelect;

function decisionDto(
  row: DecisionRow,
  events: readonly (EventRow & { actorName: string | null })[],
  assigneeName: string | null,
) {
  return {
    id: row.id,
    weekStart: row.weekStart.toISOString(),
    sourceType: row.sourceType,
    sourceFingerprint: row.sourceFingerprint,
    title: row.title,
    summary: row.summary,
    scope: row.scope,
    status: row.status,
    priority: row.priority,
    rank: row.rank,
    evidence: row.evidence,
    estimatedImpactCents: row.estimatedImpactCents,
    impactIsEstimated: row.estimatedImpactCents !== null,
    confidencePercent: row.confidencePercent,
    sampleSize: row.sampleSize,
    assignee: row.assignedToId
      ? { id: row.assignedToId, name: assigneeName ?? "Sin nombre" }
      : null,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    events: events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: { id: event.actorId, name: event.actorName ?? "Sin nombre" },
      note: event.note,
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

async function listWeek(weekStart: Date) {
  const rows = await db
    .select()
    .from(commercialDecisions)
    .where(eq(commercialDecisions.weekStart, weekStart))
    .orderBy(asc(commercialDecisions.rank));
  const decisionIds = rows.map((row) => row.id);
  const events = decisionIds.length
    ? await db
        .select()
        .from(commercialDecisionEvents)
        .where(inArray(commercialDecisionEvents.decisionId, decisionIds))
        .orderBy(commercialDecisionEvents.occurredAt)
    : [];
  const userIds = [
    ...new Set(
      [...rows.map((row) => row.assignedToId), ...events.map((event) => event.actorId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const people = userIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, userIds))
    : [];
  const names = new Map(people.map((person) => [person.id, person.name]));

  return rows.map((row) =>
    decisionDto(
      row,
      events
        .filter((event) => event.decisionId === row.id)
        .map((event) => ({ ...event, actorName: names.get(event.actorId) ?? null })),
      row.assignedToId ? names.get(row.assignedToId) ?? null : null,
    ),
  );
}

export const decisionCenterService = {
  async weekly(now = new Date()) {
    const { start: weekStart, end: weekEnd } = madridWeekBounds(now);
    const signals = await collectSignals(weekStart, weekEnd, now);
    await db.transaction(async (transaction) => {
      const materialized = await transaction
        .insert(commercialDecisionWeeks)
        .values({ weekStart })
        .onConflictDoNothing()
        .returning({ weekStart: commercialDecisionWeeks.weekStart });
      if (materialized.length === 0 || signals.length === 0) return;
      await transaction.insert(commercialDecisions).values(
        rankWeeklyDecisionCandidates(signals).map((signal) => ({
          id: crypto.randomUUID(),
          weekStart,
          ...signal,
          status: "proposed" as const,
        })),
      );
    });
    return {
      weekStart: weekStart.toISOString(),
      decisions: await listWeek(weekStart),
      maximumDecisions: 5 as const,
      suggestionOnly: true as const,
    };
  },

  async transition(input: {
    decisionId: string;
    action: DecisionAction;
    actorId: string;
    note?: string;
  }) {
    return db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(commercialDecisions)
        .where(eq(commercialDecisions.id, input.decisionId))
        .for("update");
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Decisión no encontrada." });
      }
      let next: CommercialDecisionStatus;
      try {
        next = nextDecisionStatus(current.status, input.action);
      } catch {
        throw new TRPCError({ code: "CONFLICT", message: "Transición de decisión no permitida." });
      }
      const [updated] = await transaction
        .update(commercialDecisions)
        .set({ status: next, updatedAt: new Date() })
        .where(
          and(
            eq(commercialDecisions.id, current.id),
            eq(commercialDecisions.status, current.status),
          ),
        )
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "La decisión cambió mientras se procesaba." });
      }
      await transaction.insert(commercialDecisionEvents).values({
        id: crypto.randomUUID(),
        decisionId: current.id,
        fromStatus: current.status,
        toStatus: next,
        actorId: input.actorId,
        note: input.note,
      });
      return { id: updated.id, status: updated.status };
    });
  },
};

export type DecisionCenterSource = CommercialDecisionSource;
