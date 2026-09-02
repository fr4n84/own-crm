import { confirmedProfileValue, parseConfirmedFacts } from "../../commercial-evidence/facts";
import {
  classifyConversionLead,
  type FunnelLead,
} from "../../dashboard/conversion-funnel";
import { isAuthoritativeCallerContact, isAuthoritativeCallerFeedback } from "../../lead-feedback-events";

export const DEFAULT_CALLER_RANKING_SAMPLE_SIZE = 10;

const EXACT_SEGMENT_BASELINE_SIZE = 5;
const QUALITY_WEIGHTS = {
  appointment: 0.25,
  show: 0.3,
  sale: 0.45,
} as const;

const SPEED_BUCKETS = [
  { key: "under_15", label: "Menos de 15 min" },
  { key: "from_15_to_60", label: "15–60 min" },
  { key: "from_1_to_3_hours", label: "1–3 h" },
  { key: "from_3_to_24_hours", label: "3–24 h" },
  { key: "over_24_hours", label: "Más de 24 h" },
  { key: "not_contacted", label: "Sin contacto" },
] as const;

const ATTEMPT_BUCKETS = [
  { key: "zero", label: "0 intentos" },
  { key: "one", label: "1 intento" },
  { key: "two", label: "2 intentos" },
  { key: "three", label: "3 intentos" },
  { key: "four_plus", label: "4+ intentos" },
] as const;

type SpeedBucketKey = (typeof SPEED_BUCKETS)[number]["key"];
type AttemptBucketKey = (typeof ATTEMPT_BUCKETS)[number]["key"];

type CallerQualityEvent = FunnelLead["events"][number];

export type CallerQualityLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  type: "maestra" | "vsl";
  callerId: string;
  callerName: string | null;
  closerId?: string | null;
  closerName?: string | null;
  assignedAt: Date;
  assignmentEndedAt: Date | null;
  source: string | null;
  campaign: string | null;
  events: CallerQualityEvent[];
};

type EvaluatedLead = Omit<CallerQualityLead, "events"> & {
  profile: string | null;
  contacted: boolean;
  appointment: boolean;
  show: boolean;
  sale: boolean;
  firstContactMinutes: number | null;
  attemptCount: number;
  attemptIntervalMinutes: number;
  attemptIntervalCount: number;
  quality: number;
  expectedQuality: number;
};

type MetricLead = Pick<
  EvaluatedLead,
  "contacted" | "appointment" | "show" | "sale" | "firstContactMinutes"
>;

function percentage(count: number, total: number) {
  return total === 0 ? 0 : Math.round((count / total) * 1_000) / 10;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function readProfile(events: readonly CallerQualityEvent[]) {
  for (const event of [...events].filter(isAuthoritativeCallerFeedback).reverse()) {
    const questions = event.metadata.questions;
    if (!Array.isArray(questions)) continue;
    const parsed = questions.filter((question): question is { questionKey: string; answer: string } => typeof question === "object" && question !== null && "questionKey" in question && "answer" in question && typeof question.questionKey === "string" && typeof question.answer === "string");
    const profile = confirmedProfileValue(parseConfirmedFacts(parsed));
    if (profile) return profile;
  }
  return null;
}

function eventsWithinAssignment(lead: CallerQualityLead) {
  return lead.events
    .filter(
      (event) =>
        event.occurredAt >= lead.assignedAt &&
        (!lead.assignmentEndedAt || event.occurredAt < lead.assignmentEndedAt),
    )
    .sort((first, second) => first.occurredAt.getTime() - second.occurredAt.getTime());
}

function evaluateLead(lead: CallerQualityLead) {
  const events = eventsWithinAssignment(lead);
  const classification = classifyConversionLead({
    ...lead,
    closerId: lead.closerId ?? null,
    closerName: lead.closerName ?? null,
    events,
  });
  const firstContact = events.find(
    isAuthoritativeCallerContact,
  );
  const firstContactMinutes = firstContact
    ? Math.max(0, (firstContact.occurredAt.getTime() - lead.assignedAt.getTime()) / 60_000)
    : null;
  const callerFeedbackEvents = events.filter(isAuthoritativeCallerFeedback);
  const firstValidContactIndex = callerFeedbackEvents.findIndex(
    isAuthoritativeCallerContact,
  );
  const attemptEvents = firstValidContactIndex >= 0
    ? callerFeedbackEvents.slice(0, firstValidContactIndex + 1)
    : callerFeedbackEvents;
  const attemptIntervals = attemptEvents.slice(1).map((event, index) =>
    Math.max(0, (event.occurredAt.getTime() - (attemptEvents[index]?.occurredAt.getTime() ?? event.occurredAt.getTime())) / 60_000),
  );
  const quality =
    Number(classification.appointment) * QUALITY_WEIGHTS.appointment +
    Number(classification.show) * QUALITY_WEIGHTS.show +
    Number(classification.sale) * QUALITY_WEIGHTS.sale;

  return {
    ...lead,
    events: undefined,
    profile: readProfile(events),
    ...classification,
    firstContactMinutes,
    attemptCount: attemptEvents.length,
    attemptIntervalMinutes: attemptIntervals.reduce((sum, value) => sum + value, 0),
    attemptIntervalCount: attemptIntervals.length,
    quality,
    expectedQuality: 0,
  } satisfies EvaluatedLead & { events: undefined };
}

function segmentValue(value: string | null, fallback: string) {
  return value?.trim() || fallback;
}

function segmentKey(lead: Pick<EvaluatedLead, "profile" | "source" | "campaign">) {
  return [
    segmentValue(lead.profile, "Sin perfil"),
    segmentValue(lead.source, "Sin fuente"),
    segmentValue(lead.campaign, "Sin campaña"),
  ].join("\u0000");
}

function summarizeMetrics(leads: readonly MetricLead[]) {
  const firstContactValues = leads.flatMap(({ firstContactMinutes }) =>
    firstContactMinutes === null ? [] : [firstContactMinutes],
  );
  return {
    assigned: leads.length,
    contactedRate: percentage(leads.filter(({ contacted }) => contacted).length, leads.length),
    appointmentRate: percentage(leads.filter(({ appointment }) => appointment).length, leads.length),
    showRate: percentage(leads.filter(({ show }) => show).length, leads.length),
    saleRate: percentage(leads.filter(({ sale }) => sale).length, leads.length),
    averageFirstContactMinutes:
      firstContactValues.length === 0
        ? null
        : Math.round(
            firstContactValues.reduce((sum, value) => sum + value, 0) /
              firstContactValues.length,
          ),
  };
}

function speedBucketKey(firstContactMinutes: number | null): SpeedBucketKey {
  if (firstContactMinutes === null) return "not_contacted";
  if (firstContactMinutes < 15) return "under_15";
  if (firstContactMinutes < 60) return "from_15_to_60";
  if (firstContactMinutes < 180) return "from_1_to_3_hours";
  if (firstContactMinutes < 1_440) return "from_3_to_24_hours";
  return "over_24_hours";
}

function buildSpeedBuckets(leads: readonly EvaluatedLead[]) {
  return SPEED_BUCKETS.map(({ key, label }) => ({
    key,
    label,
    ...summarizeMetrics(
      leads.filter(({ firstContactMinutes }) => speedBucketKey(firstContactMinutes) === key),
    ),
  }));
}

function buildSpeedGroups(
  leads: readonly EvaluatedLead[],
  select: (lead: EvaluatedLead) => { value: string; label: string },
) {
  const groups = new Map<string, { label: string; leads: EvaluatedLead[] }>();
  for (const lead of leads) {
    const { value, label } = select(lead);
    const group = groups.get(value) ?? { label, leads: [] };
    group.leads.push(lead);
    groups.set(value, group);
  }
  return [...groups]
    .map(([value, group]) => ({
      value,
      label: group.label,
      total: group.leads.length,
      buckets: buildSpeedBuckets(group.leads),
    }))
    .sort((first, second) => second.total - first.total || first.label.localeCompare(second.label));
}

function buildSpeedAnalysis(leads: readonly EvaluatedLead[]) {
  const callers = buildSpeedGroups(leads, (lead) => ({
    value: lead.callerId,
    label: lead.callerName ?? "Sin nombre",
  })).map((caller) => {
    const callerLeads = leads.filter(({ callerId }) => callerId === caller.value);
    return {
      ...caller,
      profiles: buildSpeedGroups(callerLeads, (lead) => {
        const value = segmentValue(lead.profile, "Sin perfil");
        return { value, label: value };
      }),
      sources: buildSpeedGroups(callerLeads, (lead) => {
        const value = segmentValue(lead.source, "Sin fuente");
        return { value, label: value };
      }),
      campaigns: buildSpeedGroups(callerLeads, (lead) => {
        const value = segmentValue(lead.campaign, "Sin campaña");
        return { value, label: value };
      }),
    };
  });
  return {
    overall: buildSpeedBuckets(leads),
    callers,
    profiles: buildSpeedGroups(leads, (lead) => {
      const value = segmentValue(lead.profile, "Sin perfil");
      return { value, label: value };
    }),
    sources: buildSpeedGroups(leads, (lead) => {
      const value = segmentValue(lead.source, "Sin fuente");
      return { value, label: value };
    }),
    campaigns: buildSpeedGroups(leads, (lead) => {
      const value = segmentValue(lead.campaign, "Sin campaña");
      return { value, label: value };
    }),
  };
}

function attemptBucketKey(attemptCount: number): AttemptBucketKey {
  if (attemptCount === 0) return "zero";
  if (attemptCount === 1) return "one";
  if (attemptCount === 2) return "two";
  if (attemptCount === 3) return "three";
  return "four_plus";
}

function buildAttemptSummary(leads: readonly EvaluatedLead[]) {
  const intervalCount = leads.reduce((sum, lead) => sum + lead.attemptIntervalCount, 0);
  const notContactedBelowThree = leads.filter(
    ({ contacted, attemptCount }) => !contacted && attemptCount < 3,
  ).length;
  return {
    total: leads.length,
    averageAttempts: leads.length === 0
      ? 0
      : round(leads.reduce((sum, lead) => sum + lead.attemptCount, 0) / leads.length),
    averageAttemptIntervalMinutes: intervalCount === 0
      ? null
      : Math.round(
          leads.reduce((sum, lead) => sum + lead.attemptIntervalMinutes, 0) / intervalCount,
        ),
    notContactedBelowThree,
    notContactedBelowThreeRate: percentage(notContactedBelowThree, leads.length),
    buckets: ATTEMPT_BUCKETS.map(({ key, label }) => {
      const bucketLeads = leads.filter(({ attemptCount }) => attemptBucketKey(attemptCount) === key);
      return { key, label, ...summarizeMetrics(bucketLeads) };
    }),
  };
}

function buildAttemptGroups(
  leads: readonly EvaluatedLead[],
  select: (lead: EvaluatedLead) => { value: string; label: string },
) {
  const groups = new Map<string, { label: string; leads: EvaluatedLead[] }>();
  for (const lead of leads) {
    const { value, label } = select(lead);
    const group = groups.get(value) ?? { label, leads: [] };
    group.leads.push(lead);
    groups.set(value, group);
  }
  return [...groups]
    .map(([value, group]) => ({ value, label: group.label, ...buildAttemptSummary(group.leads) }))
    .sort((first, second) => second.total - first.total || first.label.localeCompare(second.label));
}

function buildAttemptAnalysis(leads: readonly EvaluatedLead[]) {
  const callers = buildAttemptGroups(leads, (lead) => ({
    value: lead.callerId,
    label: lead.callerName ?? "Sin nombre",
  })).map((caller) => {
    const callerLeads = leads.filter(({ callerId }) => callerId === caller.value);
    return {
      ...caller,
      profiles: buildAttemptGroups(callerLeads, (lead) => {
        const value = segmentValue(lead.profile, "Sin perfil");
        return { value, label: value };
      }),
      sources: buildAttemptGroups(callerLeads, (lead) => {
        const value = segmentValue(lead.source, "Sin fuente");
        return { value, label: value };
      }),
      campaigns: buildAttemptGroups(callerLeads, (lead) => {
        const value = segmentValue(lead.campaign, "Sin campaña");
        return { value, label: value };
      }),
    };
  });
  return {
    overall: buildAttemptSummary(leads),
    callers,
    profiles: buildAttemptGroups(leads, (lead) => {
      const value = segmentValue(lead.profile, "Sin perfil");
      return { value, label: value };
    }),
    sources: buildAttemptGroups(leads, (lead) => {
      const value = segmentValue(lead.source, "Sin fuente");
      return { value, label: value };
    }),
    campaigns: buildAttemptGroups(leads, (lead) => {
      const value = segmentValue(lead.campaign, "Sin campaña");
      return { value, label: value };
    }),
  };
}

function buildBreakdown(
  leads: readonly EvaluatedLead[],
  selectValue: (lead: EvaluatedLead) => string,
) {
  const groups = new Map<string, EvaluatedLead[]>();
  for (const lead of leads) {
    const value = selectValue(lead);
    const group = groups.get(value) ?? [];
    group.push(lead);
    groups.set(value, group);
  }
  return [...groups]
    .map(([value, groupedLeads]) => ({ value, ...summarizeMetrics(groupedLeads) }))
    .sort((first, second) => second.assigned - first.assigned || first.value.localeCompare(second.value));
}

function weekStart(date: Date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function periodKey(date: Date, period: "week" | "month") {
  if (period === "week") return weekStart(date).toISOString().slice(0, 10);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(key: string, period: "week" | "month") {
  const date = period === "week"
    ? new Date(`${key}T00:00:00.000Z`)
    : new Date(`${key}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("es-ES", {
    ...(period === "week" ? { day: "2-digit" as const } : {}),
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date).replace(" de ", " ").replace(" de ", " ");
}

function buildTrends(leads: readonly EvaluatedLead[], period: "week" | "month") {
  const groups = new Map<string, EvaluatedLead[]>();
  for (const lead of leads) {
    const key = `${periodKey(lead.assignedAt, period)}\u0000${lead.callerId}`;
    const group = groups.get(key) ?? [];
    group.push(lead);
    groups.set(key, group);
  }
  return [...groups]
    .map(([key, groupedLeads]) => {
      const [bucket = "", callerId = ""] = key.split("\u0000");
      return {
        key: bucket,
        label: periodLabel(bucket, period),
        callerId,
        callerName: groupedLeads[0]?.callerName ?? "Sin nombre",
        ...summarizeMetrics(groupedLeads),
      };
    })
    .sort((first, second) => first.key.localeCompare(second.key) || first.callerName.localeCompare(second.callerName));
}

export function buildCallerQualityRanking(
  input: readonly CallerQualityLead[],
  minimumSampleSize = DEFAULT_CALLER_RANKING_SAMPLE_SIZE,
) {
  const evaluated = input.map(evaluateLead).map(({ events: _events, ...lead }) => lead);
  const globalExpected = evaluated.length === 0
    ? 0
    : evaluated.reduce((sum, lead) => sum + lead.quality, 0) / evaluated.length;
  const segments = new Map<string, EvaluatedLead[]>();
  for (const lead of evaluated) {
    const key = segmentKey(lead);
    const group = segments.get(key) ?? [];
    group.push(lead);
    segments.set(key, group);
  }
  const leadsWithExpected = evaluated.map((lead) => {
    const segment = segments.get(segmentKey(lead)) ?? [];
    const expectedQuality = segment.length >= EXACT_SEGMENT_BASELINE_SIZE
      ? segment.reduce((sum, item) => sum + item.quality, 0) / segment.length
      : globalExpected;
    return { ...lead, expectedQuality };
  });

  const callers = new Map<string, EvaluatedLead[]>();
  for (const lead of leadsWithExpected) {
    const group = callers.get(lead.callerId) ?? [];
    group.push(lead);
    callers.set(lead.callerId, group);
  }
  const rows = [...callers].map(([callerId, callerLeads]) => {
    const actual = callerLeads.reduce((sum, lead) => sum + lead.quality, 0) / callerLeads.length;
    const expected = callerLeads.reduce((sum, lead) => sum + lead.expectedQuality, 0) / callerLeads.length;
    return {
      callerId,
      callerName: callerLeads[0]?.callerName ?? "Sin nombre",
      ...summarizeMetrics(callerLeads),
      adjustedIndex: round(Math.max(0, Math.min(200, 100 + (actual - expected) * 100))),
      breakdowns: {
        profiles: buildBreakdown(callerLeads, (lead) => segmentValue(lead.profile, "Sin perfil")),
        sources: buildBreakdown(callerLeads, (lead) => segmentValue(lead.source, "Sin fuente")),
        campaigns: buildBreakdown(callerLeads, (lead) => segmentValue(lead.campaign, "Sin campaña")),
      },
      leads: callerLeads.map(({
        expectedQuality: _expectedQuality,
        quality: _quality,
        attemptIntervalMinutes: _attemptIntervalMinutes,
        attemptIntervalCount: _attemptIntervalCount,
        ...lead
      }) => lead),
    };
  });
  const eligible = rows
    .filter(({ assigned }) => assigned >= minimumSampleSize)
    .sort((first, second) => second.adjustedIndex - first.adjustedIndex || second.saleRate - first.saleRate);

  return {
    minimumSampleSize,
    methodology: "Índice 100 = resultado esperado según la mezcla de perfil, fuente y campaña. Solo se ordenan callers con muestra suficiente.",
    ranked: eligible.map((row, index) => ({ ...row, rank: index + 1 })),
    insufficientSample: rows
      .filter(({ assigned }) => assigned < minimumSampleSize)
      .sort((first, second) => second.assigned - first.assigned),
    weekly: buildTrends(leadsWithExpected, "week"),
    monthly: buildTrends(leadsWithExpected, "month"),
    speedAnalysis: buildSpeedAnalysis(leadsWithExpected),
    attemptAnalysis: buildAttemptAnalysis(leadsWithExpected),
  };
}

export function selectCallerQualityRanking(
  ranking: ReturnType<typeof buildCallerQualityRanking>,
  callerId?: string,
) {
  if (!callerId) return ranking;
  const selectedSpeed = ranking.speedAnalysis.callers.find(({ value }) => value === callerId);
  const selectedAttempts = ranking.attemptAnalysis.callers.find(({ value }) => value === callerId);
  return {
    ...ranking,
    ranked: ranking.ranked.filter((caller) => caller.callerId === callerId),
    insufficientSample: ranking.insufficientSample.filter(
      (caller) => caller.callerId === callerId,
    ),
    weekly: ranking.weekly.filter((row) => row.callerId === callerId),
    monthly: ranking.monthly.filter((row) => row.callerId === callerId),
    speedAnalysis: selectedSpeed
      ? {
          overall: selectedSpeed.buckets,
          callers: [selectedSpeed],
          profiles: selectedSpeed.profiles,
          sources: selectedSpeed.sources,
          campaigns: selectedSpeed.campaigns,
        }
      : {
          overall: buildSpeedBuckets([]),
          callers: [],
          profiles: [],
          sources: [],
          campaigns: [],
        },
    attemptAnalysis: selectedAttempts
      ? {
          overall: selectedAttempts,
          callers: [selectedAttempts],
          profiles: selectedAttempts.profiles,
          sources: selectedAttempts.sources,
          campaigns: selectedAttempts.campaigns,
        }
      : {
          overall: buildAttemptSummary([]),
          callers: [],
          profiles: [],
          sources: [],
          campaigns: [],
        },
  };
}
