import { db } from "@crm-fran/db";
import { isCallerRoleId, isCloserRoleId, type Permission } from "@crm-fran/db/schema/auth";

import { listAlerts } from "./list-alerts";
import {
  listLeadRiskQueue,
  type LeadRiskPriority,
} from "./lead-risk-queue";
import { listSkippedRecommendationKeys } from "./next-best-action-events";
import { listReceivableSummaries } from "../../receivables/service";

type ActionLead = {
  id: string;
  name: string;
  callerId?: string | null;
  closerId?: string | null;
  caller: { id: string; name: string } | null;
  closer?: { id: string; name: string } | null;
};

type ActionAlert<TLead extends ActionLead> = {
  id: string;
  lead: TLead | null;
  targetUserId?: string | null;
  kind: string;
  severity: string;
  message: string;
  nextShowAt: Date;
  targetUser?: { roleId?: string | null } | null;
};

type ActionRiskItem<TLead extends ActionLead> = {
  lead: TLead;
  priority: LeadRiskPriority;
  attemptCount: number;
  minutesSinceAssignment: number;
  minutesSinceLastAttempt: number | null;
  assignedAt: Date;
  lastAttemptAt: Date | null;
};

export type NextBestActionSignalKind =
  | "whatsapp_pending"
  | "appointment_upcoming"
  | "hot_lead"
  | "payment_due"
  | "payment_overdue";

export type NextBestActionSignal<TLead extends ActionLead = ActionLead> = {
  kind: NextBestActionSignalKind;
  lead: TLead;
  reason: string;
  scheduledAt: Date | null;
};

type OperationalLead = ActionLead & {
  questions: readonly { questionKey: string; answer: string }[];
  whatsappSentAt: Date | null;
  updatedAt: Date;
};

type OperationalReceivable = {
  currency: string;
  outstandingCents: number;
  overdueCents: number;
  nextDueOn: string | null;
};

export type NextBestActionUrgency = "critical" | "high" | "medium" | "low";
export type NextBestActionMode = "caller" | "closer";

export type NextBestAction<TLead extends ActionLead = ActionLead> = {
  position: number;
  lead: TLead;
  actionType: string;
  score: number;
  urgency: NextBestActionUrgency;
  reasons: string[];
  scheduledAt: Date | null;
  attemptCount: number | null;
  minutesSinceAssignment: number | null;
  minutesSinceLastAttempt: number | null;
  /** Stable lifecycle identity; alert recommendations keep their alert source. */
  recommendationKey: string;
  sourceAlertId: string | null;
  workMode: NextBestActionMode;
};

export function availableNextBestActionModes({
  roleId,
  permissions,
  ownsCallerWork = false,
  ownsCloserWork = false,
}: {
  roleId: string;
  permissions: readonly Permission[];
  ownsCallerWork?: boolean;
  ownsCloserWork?: boolean;
}): NextBestActionMode[] {
  if (permissions.includes("*")) return ["caller", "closer"];
  const modes = new Set<NextBestActionMode>();
  if (isCallerRoleId(roleId) || ownsCallerWork) modes.add("caller");
  if (isCloserRoleId(roleId) || ownsCloserWork) modes.add("closer");
  return [...modes];
}

export async function resolveNextBestActionModes({
  actorId,
  roleId,
  permissions,
}: {
  actorId: string;
  roleId: string;
  permissions: readonly Permission[];
}) {
  if (permissions.includes("*")) return ["caller", "closer"] satisfies NextBestActionMode[];

  const [callerLead, closerLead] = await Promise.all([
    db.query.leads.findFirst({
      columns: { id: true },
      where: (table, { eq }) => eq(table.callerId, actorId),
    }),
    db.query.leads.findFirst({
      columns: { id: true },
      where: (table, { eq }) => eq(table.closerId, actorId),
    }),
  ]);

  return availableNextBestActionModes({
    roleId,
    permissions,
    ownsCallerWork: Boolean(callerLead),
    ownsCloserWork: Boolean(closerLead),
  });
}

const CALLER_ACTION_TYPES = new Set(["no_contact", "future_call", "follow_up"]);
const CLOSER_ACTION_TYPES = new Set(["appointment", "sale", "rescheduled", "follow_up"]);
const CALLER_SIGNAL_TYPES = new Set<NextBestActionSignalKind>(["whatsapp_pending", "hot_lead"]);
const CLOSER_SIGNAL_TYPES = new Set<NextBestActionSignalKind>(["appointment_upcoming", "payment_due", "payment_overdue"]);

export function actionTypeMatchesMode(actionType: string, mode: NextBestActionMode, targetRole?: string | null) {
  if (actionType === "follow_up") {
    if (targetRole === "role-caller") return mode === "caller";
    if (targetRole === "role-closer") return mode === "closer";
  }
  return (mode === "caller" ? CALLER_ACTION_TYPES : CLOSER_ACTION_TYPES).has(actionType)
    || (mode === "caller" ? CALLER_SIGNAL_TYPES : CLOSER_SIGNAL_TYPES).has(actionType as NextBestActionSignalKind);
}

function alertMatchesMode(alert: ActionAlert<ActionLead>, mode: NextBestActionMode) {
  if (alert.kind === "appointment" || alert.kind === "rescheduled") {
    return mode === "closer";
  }
  if (alert.kind === "future_call") return mode === "caller";

  const targetUserId = alert.targetUserId;
  if (targetUserId && alert.lead) {
    const isCallerWork = alert.lead.callerId === targetUserId;
    const isCloserWork = alert.lead.closerId === targetUserId;
    if (isCloserWork && !isCallerWork) return mode === "closer";
    if (isCallerWork && !isCloserWork) return mode === "caller";
  }

  return actionTypeMatchesMode(alert.kind, mode, alert.targetUser?.roleId);
}

export function buildRiskRecommendationKey(input: {
  leadId: string;
  assignedAt: Date;
  lastAttemptAt: Date | null;
}) {
  return `risk:${input.leadId}:${input.assignedAt.toISOString()}:${input.lastAttemptAt?.toISOString() ?? "none"}`;
}

export function buildAlertRecommendationKey(input: { alertId: string; nextShowAt: Date }) {
  return `alert:${input.alertId}:${input.nextShowAt.toISOString()}`;
}

const RISK_SCORE: Record<LeadRiskPriority, number> = {
  critical: 125,
  high: 100,
  medium: 75,
  low: 50,
};

const RISK_REASON: Record<LeadRiskPriority, string> = {
  critical: "Más de 24 horas sin contacto válido",
  high: "Entre 3 y 24 horas sin contacto válido",
  medium: "Entre 1 y 3 horas sin contacto válido",
  low: "Más de 15 minutos sin contacto válido",
};

const ALERT_BASE_SCORE: Record<string, number> = {
  no_contact: 90,
  follow_up: 75,
  appointment: 85,
  rescheduled: 95,
  sale: 100,
};

const SIGNAL_SCORE: Record<NextBestActionSignalKind, number> = {
  payment_overdue: 140,
  appointment_upcoming: 115,
  hot_lead: 100,
  payment_due: 90,
  whatsapp_pending: 65,
};

export function buildSignalRecommendationKey(input: NextBestActionSignal) {
  return `signal:${input.kind}:${input.lead.id}:${input.scheduledAt?.toISOString() ?? "current"}`;
}

export function parseSignalRecommendationKey(key: string) {
  const match = /^signal:([a-z_]+):([^:]+):(.+)$/.exec(key);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const kind = match[1] as NextBestActionSignalKind;
  if (!CALLER_SIGNAL_TYPES.has(kind) && !CLOSER_SIGNAL_TYPES.has(kind)) return null;
  const scheduledAt = match[3] === "current" ? null : new Date(match[3]);
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return null;
  return { kind, leadId: match[2], scheduledAt };
}

function hasPositiveContact(questions: OperationalLead["questions"]) {
  return [...questions].reverse().some((item) =>
    item.questionKey === "isContacted" && item.answer.trim().toLocaleLowerCase("es") === "si",
  );
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

function dueDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function deriveOperationalSignals<TLead extends OperationalLead>({
  mode,
  now,
  leads,
  receivables,
}: {
  mode: NextBestActionMode;
  now: Date;
  leads: readonly TLead[];
  receivables: ReadonlyMap<string, OperationalReceivable>;
}): NextBestActionSignal<TLead>[] {
  const signals: NextBestActionSignal<TLead>[] = [];
  for (const lead of leads) {
    if (mode === "caller") {
      if (lead.whatsappSentAt && now.getTime() - lead.whatsappSentAt.getTime() >= 24 * 60 * 60 * 1_000) {
        signals.push({
          kind: "whatsapp_pending",
          lead,
          reason: "WhatsApp enviado hace al menos 24 h sin respuesta registrada; comprueba el chat manualmente",
          scheduledAt: lead.whatsappSentAt,
        });
      }
      if (hasPositiveContact(lead.questions) && now.getTime() - lead.updatedAt.getTime() <= 72 * 60 * 60 * 1_000) {
        signals.push({
          kind: "hot_lead",
          lead,
          reason: "Respuesta positiva registrada en las últimas 72 h; confirma el siguiente paso",
          scheduledAt: lead.updatedAt,
        });
      }
      continue;
    }

    const receivable = receivables.get(lead.id);
    if (!receivable || receivable.outstandingCents <= 0 || !receivable.nextDueOn) continue;
    const overdue = receivable.overdueCents > 0;
    signals.push({
      kind: overdue ? "payment_overdue" : "payment_due",
      lead,
      reason: overdue
        ? `Cobro vencido: ${money(receivable.overdueCents, receivable.currency)} pendientes`
        : `Próximo cobro: ${money(receivable.outstandingCents, receivable.currency)} pendientes`,
      scheduledAt: dueDate(receivable.nextDueOn),
    });
  }
  return signals;
}

export async function listOperationalSignals({
  actorId,
  permissions,
  mode,
  now,
}: {
  actorId: string;
  permissions: readonly Permission[];
  mode: NextBestActionMode;
  now: Date;
}) {
  const canSeeAll = permissions.includes("*");
  const ownedLeads = await db.query.leads.findMany({
    where: canSeeAll
      ? undefined
      : (table, { eq }) => eq(mode === "caller" ? table.callerId : table.closerId, actorId),
    with: { caller: true, closer: true },
  });
  const receivables = mode === "closer" ? await listReceivableSummaries() : new Map<string, OperationalReceivable>();
  return deriveOperationalSignals({ mode, now, leads: ownedLeads, receivables });
}

function urgencyForScore(score: number): NextBestActionUrgency {
  if (score >= 120) return "critical";
  if (score >= 90) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function alertScore(alert: ActionAlert<ActionLead>, now: Date) {
  if (alert.kind === "future_call" || alert.kind === "appointment") {
    const remainingHours =
      (alert.nextShowAt.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (alert.kind === "future_call") {
      if (remainingHours <= 0) return 130;
      if (remainingHours <= 2) return 110;
      if (remainingHours <= 24) return 70;
      return 30;
    }
    if (remainingHours <= 0) return 120;
    if (remainingHours <= 2) return 110;
    if (remainingHours <= 24) return 90;
    return 50;
  }

  if (alert.kind === "follow_up" && alert.nextShowAt <= now) return 105;

  const severityBonus =
    alert.severity === "urgent" ? 20 : alert.severity === "warning" ? 10 : 0;
  return (ALERT_BASE_SCORE[alert.kind] ?? 40) + severityBonus;
}

function mergeAction<TLead extends ActionLead>(
  actions: Map<string, Omit<NextBestAction<TLead>, "position" | "urgency">>,
  incoming: Omit<NextBestAction<TLead>, "position" | "urgency">,
) {
  const current = actions.get(incoming.lead.id);
  if (!current) {
    actions.set(incoming.lead.id, incoming);
    return;
  }

  const primary = incoming.score > current.score ? incoming : current;
  actions.set(incoming.lead.id, {
    ...primary,
    reasons: [...new Set([...current.reasons, ...incoming.reasons])],
    scheduledAt: primary.scheduledAt ?? current.scheduledAt ?? incoming.scheduledAt,
    attemptCount: primary.attemptCount ?? current.attemptCount ?? incoming.attemptCount,
    minutesSinceAssignment:
      primary.minutesSinceAssignment ??
      current.minutesSinceAssignment ??
      incoming.minutesSinceAssignment,
    minutesSinceLastAttempt:
      primary.minutesSinceLastAttempt ??
      current.minutesSinceLastAttempt ??
      incoming.minutesSinceLastAttempt,
    // The highest-scoring signal is also the action whose lifecycle we track.
    recommendationKey: primary.recommendationKey,
    sourceAlertId: primary.sourceAlertId,
  });
}

export function buildNextBestActions<TLead extends ActionLead>({
  alerts,
  riskItems,
  signals = [],
  now,
  mode = "caller",
}: {
  alerts: readonly ActionAlert<TLead>[];
  riskItems: readonly ActionRiskItem<TLead>[];
  signals?: readonly NextBestActionSignal<TLead>[];
  now: Date;
  mode?: NextBestActionMode;
}): NextBestAction<TLead>[] {
  const actions = new Map<
    string,
    Omit<NextBestAction<TLead>, "position" | "urgency">
  >();

  for (const item of mode === "caller" ? riskItems : []) {
    // A failed attempt should not immediately be presented again as the next action.
    if (item.minutesSinceLastAttempt !== null && item.minutesSinceLastAttempt < 15) {
      continue;
    }
    mergeAction(actions, {
      lead: item.lead,
      actionType: "no_contact",
      score: RISK_SCORE[item.priority],
      reasons: [RISK_REASON[item.priority]],
      scheduledAt: null,
      attemptCount: item.attemptCount,
      minutesSinceAssignment: item.minutesSinceAssignment,
      minutesSinceLastAttempt: item.minutesSinceLastAttempt,
      recommendationKey: buildRiskRecommendationKey({
        leadId: item.lead.id,
        assignedAt: item.assignedAt,
        lastAttemptAt: item.lastAttemptAt,
      }),
      sourceAlertId: null,
      workMode: "caller",
    });
  }

  for (const alert of alerts) {
    if (!alert.lead || !alertMatchesMode(alert, mode)) continue;
    const score = alertScore(alert, now);
    mergeAction(actions, {
      lead: alert.lead,
      actionType: alert.kind,
      score,
      reasons: [alert.message],
      scheduledAt: alert.nextShowAt,
      attemptCount: null,
      minutesSinceAssignment: null,
      minutesSinceLastAttempt: null,
      recommendationKey: buildAlertRecommendationKey({ alertId: alert.id, nextShowAt: alert.nextShowAt }),
      sourceAlertId: alert.id,
      workMode: mode,
    });
  }

  const allowedSignals = mode === "caller" ? CALLER_SIGNAL_TYPES : CLOSER_SIGNAL_TYPES;
  for (const signal of signals) {
    if (!allowedSignals.has(signal.kind)) continue;
    mergeAction(actions, {
      lead: signal.lead,
      actionType: signal.kind,
      score: SIGNAL_SCORE[signal.kind],
      reasons: [signal.reason],
      scheduledAt: signal.scheduledAt,
      attemptCount: null,
      minutesSinceAssignment: null,
      minutesSinceLastAttempt: null,
      recommendationKey: buildSignalRecommendationKey(signal),
      sourceAlertId: null,
      workMode: mode,
    });
  }

  return [...actions.values()]
    .sort(
      (left, right) =>
        right.score - left.score || left.lead.name.localeCompare(right.lead.name),
    )
    .map((action, index) => ({
      ...action,
      position: index + 1,
      urgency: urgencyForScore(action.score),
    }));
}

export async function listNextBestActions({
  actorId,
  permissions,
  roleId,
  mode,
  authorizedModes,
  now = new Date(),
}: {
  actorId: string;
  permissions: readonly Permission[];
  roleId: string;
  mode: NextBestActionMode;
  authorizedModes?: readonly NextBestActionMode[];
  now?: Date;
}) {
  const resolvedModes = authorizedModes ?? await resolveNextBestActionModes({ actorId, roleId, permissions });
  if (!resolvedModes.includes(mode)) {
    throw new Error("Requested work mode is not available to this authenticated role");
  }
  const canSeeAllAlerts = permissions.includes("*");
  const [alerts, riskItems, signals] = await Promise.all([
    listAlerts({
      actorId,
      permissions: [...permissions],
      targetUserId: canSeeAllAlerts ? undefined : actorId,
      limit: 100,
    }),
    mode === "caller" ? listLeadRiskQueue({ actorId, permissions, now }) : Promise.resolve([]),
    listOperationalSignals({ actorId, permissions, mode, now }),
  ]);

  const ownedAlerts = canSeeAllAlerts
    ? alerts
    : alerts.filter(({ lead }) =>
        mode === "caller"
          ? lead?.callerId === actorId
          : lead?.closerId === actorId,
      );

  const [actions, terminalKeys] = await Promise.all([
    Promise.resolve(buildNextBestActions({ alerts: ownedAlerts, riskItems, signals, now, mode })),
    listSkippedRecommendationKeys({ actorId, permissions }),
  ]);
  return actions.filter((action) => !terminalKeys.has(action.recommendationKey));
}
