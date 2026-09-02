import { and, db, desc, eq, gte, inArray, isNull } from "@crm-fran/db";
import {
  alerts,
  leadActivityEvents,
  leads,
  LEAD_ACTIVITY_KIND,
  type LeadActivityMetadata,
} from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { actionTypeMatchesMode, buildAlertRecommendationKey, buildRiskRecommendationKey, type NextBestActionMode } from "./next-best-actions";
import { listLeadRiskQueue } from "./lead-risk-queue";
import { COMMERCIAL_EVIDENCE_POLICY_VERSION, type EvidenceSnapshot } from "../../commercial-evidence/domain";
import { buildEvidenceSnapshotForLead } from "../../commercial-evidence/service";

export type RecommendationEventKind =
  | "recommendation_shown"
  | "recommendation_opened"
  | "recommendation_completed"
  | "recommendation_skipped";

type RecommendationMetadata = LeadActivityMetadata & {
  recommendationKey?: string;
  sourceAlertId?: string | null;
  actionType?: string;
  reactionTimeMs?: number;
  reason?: string;
  evidenceSnapshot?: EvidenceSnapshot;
};

export function buildServerEvidenceSnapshot(actionType: string, asOf: Date): EvidenceSnapshot {
  return {
    policyVersion: COMMERCIAL_EVIDENCE_POLICY_VERSION,
    asOf: asOf.toISOString(),
    target: "sale",
    probabilityBps: null,
    expectedMarginCents: null,
    currency: null,
    fallback: "unavailable",
    sample: 0,
    confidence: "insufficient",
    features: { actionType },
    status: "economic_truth_missing",
  };
}

type RecommendationEvent = {
  kind: RecommendationEventKind;
  actionType?: string;
  metadata: RecommendationMetadata;
  occurredAt: Date;
};

export const terminalRecommendationKinds = new Set<RecommendationEventKind>([
  "recommendation_completed",
  "recommendation_skipped",
]);

export function parseAlertRecommendationKey(key: string) {
  const match = /^alert:([^:]+):(.+)$/.exec(key);
  if (!match?.[1] || !match[2]) return null;
  const nextShowAt = new Date(match[2]);
  return Number.isNaN(nextShowAt.getTime()) ? null : { alertId: match[1], nextShowAt };
}

export function buildRecommendationMetrics(events: readonly RecommendationEvent[]) {
  const shown = events.filter((event) => event.kind === "recommendation_shown").length;
  const completed = events.filter((event) => event.kind === "recommendation_completed").length;
  const skipped = events.filter((event) => event.kind === "recommendation_skipped").length;
  const reactionTimes = events
    .filter((event) => event.kind === "recommendation_completed")
    .map((event) => event.metadata.reactionTimeMs)
    .filter((value): value is number => typeof value === "number");
  return {
    shown,
    completed,
    skipped,
    complianceRate:
      completed + skipped === 0
        ? 0
        : Math.round((completed / (completed + skipped)) * 100),
    averageReactionMinutes:
      reactionTimes.length === 0
        ? null
        : Math.round(reactionTimes.reduce((total, value) => total + value, 0) / reactionTimes.length / 60_000),
  };
}

function canManageLead(input: { lead: { callerId: string | null; closerId: string | null }; actorId: string; permissions: readonly Permission[] }) {
  return input.permissions.includes("*") || input.lead.callerId === input.actorId || input.lead.closerId === input.actorId;
}

export async function recordRecommendationEvent(input: {
  actorId: string;
  permissions: readonly Permission[];
  leadId: string;
  recommendationKey: string;
  kind: RecommendationEventKind;
  actionType?: string;
  reason?: string;
  reactionTimeMs?: number;
}) {
  const [lead] = await db
    .select({ id: leads.id, callerId: leads.callerId, closerId: leads.closerId })
    .from(leads)
    .where(eq(leads.id, input.leadId));
  if (!lead) {
    throw new Error("No tienes acceso a esta recomendación");
  }
  const isPrivileged = input.permissions.includes("*");
  const priorEvents = await db.select({ kind: leadActivityEvents.kind, metadata: leadActivityEvents.metadata, occurredAt: leadActivityEvents.occurredAt })
    .from(leadActivityEvents)
    .where(and(eq(leadActivityEvents.leadId, input.leadId), eq(leadActivityEvents.actorId, input.actorId), inArray(leadActivityEvents.kind, [LEAD_ACTIVITY_KIND.RECOMMENDATION_SHOWN, LEAD_ACTIVITY_KIND.RECOMMENDATION_OPENED])))
    .orderBy(desc(leadActivityEvents.occurredAt));
  const priorEvent = priorEvents.find((event) => (event.metadata as RecommendationMetadata).recommendationKey === input.recommendationKey);
  if (input.kind === "recommendation_completed" && !priorEvent) {
    throw new Error("La recomendación debe mostrarse o abrirse antes de completarse");
  }
  const parsedAlertKey = parseAlertRecommendationKey(input.recommendationKey);
  const [sourceAlert] = parsedAlertKey ? await db.select({ id: alerts.id, kind: alerts.kind, targetUserId: alerts.targetUserId, nextShowAt: alerts.nextShowAt })
    .from(alerts).where(and(eq(alerts.leadId, input.leadId), eq(alerts.id, parsedAlertKey.alertId), eq(alerts.nextShowAt, parsedAlertKey.nextShowAt), isNull(alerts.dismissedAt), isNull(alerts.resolvedAt), isNull(alerts.expiredAt))) : [];
  const isBoundAlert = sourceAlert !== undefined && input.recommendationKey === buildAlertRecommendationKey({ alertId: sourceAlert.id, nextShowAt: sourceAlert.nextShowAt }) && (isPrivileged || sourceAlert.targetUserId === input.actorId);
  const riskItems = input.kind === "recommendation_completed" || isBoundAlert ? [] : await listLeadRiskQueue({ actorId: input.actorId, permissions: input.permissions });
  const isBoundRisk = riskItems.some((item) => item.lead.id === input.leadId && input.recommendationKey === buildRiskRecommendationKey({ leadId: item.lead.id, assignedAt: item.assignedAt, lastAttemptAt: item.lastAttemptAt }));
  if (input.kind !== "recommendation_completed" && ((!canManageLead({ lead, actorId: input.actorId, permissions: input.permissions }) && !isBoundAlert) || (!isBoundAlert && !isBoundRisk))) {
    throw new Error("La recomendación ya no es válida para este lead");
  }
  if (input.kind === "recommendation_skipped" && !input.reason?.trim()) {
    throw new Error("Indica el motivo para omitir la recomendación");
  }
  const priorActionType = priorEvent ? (priorEvent.metadata as RecommendationMetadata).actionType ?? (input.recommendationKey.startsWith("risk:") ? "no_contact" : input.recommendationKey.startsWith("alert:") ? "alerta" : undefined) : undefined;
  const boundActionType = sourceAlert?.kind ?? (isBoundRisk ? "no_contact" : priorActionType);
  if (!boundActionType) {
    throw new Error("No se pudo vincular el tipo de acción de la recomendación");
  }
  if (input.actionType && input.actionType !== boundActionType) {
    throw new Error("El tipo de acción no coincide con la recomendación vigente");
  }
  const dedupeKey = `recommendation:${input.kind}:${input.actorId}:${input.recommendationKey}`;
  let reactionTimeMs = input.reactionTimeMs;
  if (input.kind === "recommendation_completed" && reactionTimeMs === undefined) {
    const shown = priorEvents.find((event) => event.kind === LEAD_ACTIVITY_KIND.RECOMMENDATION_SHOWN && (event.metadata as RecommendationMetadata).recommendationKey === input.recommendationKey);
    if (shown) {
      reactionTimeMs = Math.max(0, Date.now() - shown.occurredAt.getTime());
    }
  }
  const occurredAt = new Date();
  const evidenceSnapshot = input.kind === "recommendation_shown" ? await buildEvidenceSnapshotForLead({ leadId: input.leadId, asOf: occurredAt, actionType: boundActionType }) : undefined;
  const metadata: RecommendationMetadata = {
    recommendationKey: input.recommendationKey,
    sourceAlertId: sourceAlert?.id ?? null,
    actionType: boundActionType,
    ...(input.reason ? { reason: input.reason.trim() } : {}),
    ...(reactionTimeMs === undefined ? {} : { reactionTimeMs }),
    ...(evidenceSnapshot ? { evidenceSnapshot } : {}),
  };
  await db.insert(leadActivityEvents).values({
    id: crypto.randomUUID(), leadId: input.leadId, actorId: input.actorId,
    kind: input.kind, title: input.kind.replace("recommendation_", "Recomendación "),
    description: input.reason?.trim() ?? null, metadata, dedupeKey, occurredAt,
  }).onConflictDoNothing();
  return { dedupeKey };
}

export async function listRecommendationMetrics({ actorId, permissions, mode, now = new Date() }: { actorId: string; permissions: readonly Permission[]; mode?: NextBestActionMode; now?: Date }) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db.select({ kind: leadActivityEvents.kind, metadata: leadActivityEvents.metadata, occurredAt: leadActivityEvents.occurredAt })
    .from(leadActivityEvents).innerJoin(leads, eq(leads.id, leadActivityEvents.leadId))
    .where(and(gte(leadActivityEvents.occurredAt, since), inArray(leadActivityEvents.kind, [
      LEAD_ACTIVITY_KIND.RECOMMENDATION_SHOWN, LEAD_ACTIVITY_KIND.RECOMMENDATION_OPENED,
      LEAD_ACTIVITY_KIND.RECOMMENDATION_COMPLETED, LEAD_ACTIVITY_KIND.RECOMMENDATION_SKIPPED,
    ]), permissions.includes("*") ? undefined : eq(leadActivityEvents.actorId, actorId)));
  const events = rows.map((row) => ({ kind: row.kind as RecommendationEventKind, metadata: row.metadata as RecommendationMetadata, occurredAt: row.occurredAt }));
  return buildRecommendationMetrics(mode ? events.filter((event) => event.metadata.actionType && actionTypeMatchesMode(event.metadata.actionType, mode)) : events);
}

export async function listSkippedRecommendationKeys(input: { actorId: string; permissions: readonly Permission[] }) {
  const rows = await db.select({ metadata: leadActivityEvents.metadata }).from(leadActivityEvents).innerJoin(leads, eq(leads.id, leadActivityEvents.leadId))
    .where(and(inArray(leadActivityEvents.kind, [LEAD_ACTIVITY_KIND.RECOMMENDATION_SKIPPED, LEAD_ACTIVITY_KIND.RECOMMENDATION_COMPLETED]), eq(leadActivityEvents.actorId, input.actorId)))
    .orderBy(desc(leadActivityEvents.occurredAt));
  return new Set(rows.map((row) => (row.metadata as RecommendationMetadata).recommendationKey).filter((key): key is string => Boolean(key)));
}
