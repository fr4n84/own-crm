export type QualityRole = "caller" | "closer";

export interface QualityActivityEvent {
  kind: string;
  actorRole: string | null;
  description: string | null;
  occurredAt: Date;
  metadata: Record<string, unknown> | null;
}

export interface QualityLead {
  id: string;
  name: string;
  email: string | null;
  callerId: string | null;
  callerName: string | null;
  closerId: string | null;
  closerName: string | null;
  assignedAt: Date;
  events: QualityActivityEvent[];
}

export interface QualitySettings {
  callerAbandonedHours: number;
  closerAbandonedHours: number;
  callerFollowUpGraceHours: number;
  closerFollowUpGraceHours: number;
  callerLowConversionPercent: number;
  closerLowConversionPercent: number;
}

export interface QualityLeadIssue {
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  userId: string;
  userName: string;
  referenceAt: Date;
  elapsedHours: number;
}

export interface UserConversionIssue {
  userId: string;
  userName: string;
  converted: number;
  total: number;
  percentage: number;
  threshold: number;
}

export interface QualityControls {
  abandoned: Record<QualityRole, QualityLeadIssue[]>;
  lateFollowUps: Record<QualityRole, QualityLeadIssue[]>;
  lowConversion: Record<QualityRole, UserConversionIssue[]>;
}

const TERMINAL_OUTCOMES = new Set(["venta", "no interesado"]);

function normalize(value: string | null) {
  return value?.trim().toLocaleLowerCase("es") ?? "";
}

function getRoleIdentity(lead: QualityLead, role: QualityRole) {
  return role === "caller"
    ? { id: lead.callerId, name: lead.callerName }
    : { id: lead.closerId, name: lead.closerName };
}

function latestEvent(events: QualityActivityEvent[], predicate: (event: QualityActivityEvent) => boolean) {
  return events
    .filter(predicate)
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0];
}

function latestFeedback(lead: QualityLead, role: QualityRole) {
  return latestEvent(lead.events, (event) => event.kind === `${role}_feedback`);
}

function isTerminal(lead: QualityLead) {
  return lead.events.some(
    (event) =>
      (event.kind === "caller_feedback" || event.kind === "closer_feedback") &&
      TERMINAL_OUTCOMES.has(normalize(event.description)),
  );
}

function hoursBetween(later: Date, earlier: Date) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 3_600_000);
}

function toLeadIssue(
  lead: QualityLead,
  role: QualityRole,
  referenceAt: Date,
  now: Date,
): QualityLeadIssue | null {
  const identity = getRoleIdentity(lead, role);
  if (!identity.id) return null;

  return {
    leadId: lead.id,
    leadName: lead.name,
    leadEmail: lead.email,
    userId: identity.id,
    userName: identity.name ?? "Sin nombre",
    referenceAt,
    elapsedHours: Math.floor(hoursBetween(now, referenceAt)),
  };
}

function getAbandoned(
  leads: QualityLead[],
  role: QualityRole,
  thresholdHours: number,
  now: Date,
) {
  return leads.flatMap((lead) => {
    if (isTerminal(lead)) return [];

    const latestRoleActivity = latestEvent(
      lead.events,
      (event) => event.actorRole === role || event.kind === `${role}_assigned`,
    );
    const referenceAt = latestRoleActivity?.occurredAt ?? lead.assignedAt;
    if (hoursBetween(now, referenceAt) <= thresholdHours) return [];

    const issue = toLeadIssue(lead, role, referenceAt, now);
    return issue ? [issue] : [];
  });
}

function readQuestion(metadata: Record<string, unknown> | null, key: string) {
  const questions = metadata?.questions;
  if (!Array.isArray(questions)) return null;

  const question = questions.find(
    (item): item is { key: string; value: unknown } =>
      typeof item === "object" &&
      item !== null &&
      "key" in item &&
      item.key === key &&
      "value" in item,
  );

  return typeof question?.value === "string" ? question.value : null;
}

function getAgreedAt(event: QualityActivityEvent) {
  const date = readQuestion(event.metadata, "scheduledDate");
  const time = readQuestion(event.metadata, "scheduledTime");
  if (!date || !time) return null;

  const agreedAt = new Date(`${date}T${time}:00`);
  return Number.isNaN(agreedAt.getTime()) ? null : agreedAt;
}

function getLateFollowUps(
  leads: QualityLead[],
  role: QualityRole,
  graceHours: number,
  now: Date,
) {
  const expectedOutcome = role === "caller" ? "llamar a futuro" : "seguimiento";

  return leads.flatMap((lead) => {
    if (isTerminal(lead)) return [];

    const feedback = latestFeedback(lead, role);
    if (!feedback || normalize(feedback.description) !== expectedOutcome) return [];

    const agreedAt = getAgreedAt(feedback);
    if (!agreedAt || hoursBetween(now, agreedAt) <= graceHours) return [];

    const issue = toLeadIssue(lead, role, agreedAt, now);
    return issue ? [issue] : [];
  });
}

function isConverted(lead: QualityLead, role: QualityRole) {
  if (role === "caller") {
    return lead.events.some(
      (event) =>
        event.kind === "appointment_scheduled" && event.occurredAt >= lead.assignedAt,
    );
  }

  return lead.events.some(
    (event) =>
      event.kind === "closer_feedback" &&
      normalize(event.description) === "venta" &&
      event.occurredAt >= lead.assignedAt,
  );
}

function getLowConversion(
  leads: QualityLead[],
  role: QualityRole,
  threshold: number,
) {
  const byUser = new Map<string, Omit<UserConversionIssue, "percentage" | "threshold">>();

  for (const lead of leads) {
    const identity = getRoleIdentity(lead, role);
    if (!identity.id) continue;

    const current = byUser.get(identity.id) ?? {
      userId: identity.id,
      userName: identity.name ?? "Sin nombre",
      converted: 0,
      total: 0,
    };
    current.total += 1;
    current.converted += isConverted(lead, role) ? 1 : 0;
    byUser.set(identity.id, current);
  }

  return [...byUser.values()]
    .map((item) => ({
      ...item,
      percentage: Math.round((item.converted / item.total) * 1_000) / 10,
      threshold,
    }))
    .filter((item) => item.percentage < threshold)
    .sort((left, right) => left.percentage - right.percentage || left.userName.localeCompare(right.userName));
}

export function buildQualityControls(
  leads: QualityLead[],
  settings: QualitySettings,
  now = new Date(),
): QualityControls {
  return {
    abandoned: {
      caller: getAbandoned(leads, "caller", settings.callerAbandonedHours, now),
      closer: getAbandoned(leads, "closer", settings.closerAbandonedHours, now),
    },
    lateFollowUps: {
      caller: getLateFollowUps(leads, "caller", settings.callerFollowUpGraceHours, now),
      closer: getLateFollowUps(leads, "closer", settings.closerFollowUpGraceHours, now),
    },
    lowConversion: {
      caller: getLowConversion(leads, "caller", settings.callerLowConversionPercent),
      closer: getLowConversion(leads, "closer", settings.closerLowConversionPercent),
    },
  };
}
