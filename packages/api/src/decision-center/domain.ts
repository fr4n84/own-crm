import type {
  CommercialDecisionPriority,
  CommercialDecisionSource,
  CommercialDecisionStatus,
} from "@crm-fran/db/schema/index";

export type DecisionAction = "approve" | "reject" | "start" | "complete";

export type DecisionSignal = {
  sourceType: CommercialDecisionSource;
  sourceFingerprint: string;
  title: string;
  summary: string;
  scope: string;
  priority: CommercialDecisionPriority;
  evidence: Record<string, unknown>;
  estimatedImpactCents: number | null;
  confidencePercent: number | null;
  sampleSize: number | null;
};

const MADRID_TIME_ZONE = "Europe/Madrid";
const madridFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MADRID_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function madridParts(value: Date) {
  const values = Object.fromEntries(
    madridFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year ?? 0,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

export function madridCalendarDay(value: Date) {
  const parts = madridParts(value);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function madridOffsetMilliseconds(value: Date) {
  const parts = madridParts(value);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(value.getTime() / 1_000) * 1_000;
}

function madridMidnight(calendarDate: Date) {
  const target = calendarDate.getTime();
  const firstGuess = new Date(target - madridOffsetMilliseconds(calendarDate));
  return new Date(target - madridOffsetMilliseconds(firstGuess));
}

export function madridWeekBounds(value: Date) {
  const local = madridParts(value);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const weekday = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() - weekday + 1);
  const start = madridMidnight(localDate);
  const nextCalendarMonday = new Date(localDate);
  nextCalendarMonday.setUTCDate(nextCalendarMonday.getUTCDate() + 7);
  const nextStart = madridMidnight(nextCalendarMonday);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

export function profitabilityFingerprint(
  source: string,
  campaign: string,
  action: string,
) {
  return JSON.stringify(["profitability", source, campaign, action]);
}

export function freezeQualityThresholds(settings: {
  callerAbandonedHours: number;
  closerAbandonedHours: number;
  callerFollowUpGraceHours: number;
  closerFollowUpGraceHours: number;
  callerLowConversionPercent: number;
  closerLowConversionPercent: number;
}) {
  return {
    callerAbandonedHours: settings.callerAbandonedHours,
    closerAbandonedHours: settings.closerAbandonedHours,
    callerFollowUpGraceHours: settings.callerFollowUpGraceHours,
    closerFollowUpGraceHours: settings.closerFollowUpGraceHours,
    callerLowConversionPercent: settings.callerLowConversionPercent,
    closerLowConversionPercent: settings.closerLowConversionPercent,
  };
}

const priorityOrder: Record<CommercialDecisionPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function buildWeeklyDecisionCandidates(
  signals: readonly DecisionSignal[],
): DecisionSignal[] {
  const unique = new Map<string, DecisionSignal>();
  for (const signal of signals) {
    if (!unique.has(signal.sourceFingerprint)) {
      unique.set(signal.sourceFingerprint, structuredClone(signal));
    }
  }

  return [...unique.values()]
    .sort(
      (left, right) =>
        priorityOrder[right.priority] - priorityOrder[left.priority] ||
        (right.estimatedImpactCents ?? -1) -
          (left.estimatedImpactCents ?? -1) ||
        left.sourceFingerprint.localeCompare(right.sourceFingerprint),
    )
    .slice(0, 5);
}

export function rankWeeklyDecisionCandidates(
  candidates: readonly DecisionSignal[],
) {
  return candidates.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

const transitions: Record<
  CommercialDecisionStatus,
  Partial<Record<DecisionAction, CommercialDecisionStatus>>
> = {
  proposed: { approve: "approved", reject: "rejected" },
  approved: { start: "in_progress" },
  rejected: {},
  in_progress: { complete: "completed" },
  completed: {},
};

export function nextDecisionStatus(
  current: CommercialDecisionStatus,
  action: DecisionAction,
): CommercialDecisionStatus {
  const next = transitions[current][action];
  if (!next) throw new Error("Invalid decision transition");
  return next;
}
