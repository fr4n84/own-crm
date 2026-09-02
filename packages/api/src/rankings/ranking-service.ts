import { and, asc, db, eq, gte, lt } from "@crm-fran/db";
import {
  leads,
  rankingEvents,
  rankingMonthlyResults,
  rankingPointSettings,
  RANKING_METRIC,
  type LeadQASessionItem,
  type RankingMetric,
  user,
} from "@crm-fran/db/schema/index";

import { scoreMetrics } from "./ranking-metrics";

export type RankingPeriod = "week" | "fortnight" | "month";

const DEFAULT_SETTINGS = {
  id: "global",
  callerLeadTakenPoints: 1,
  callerAppointmentPoints: 3,
  callerShowPoints: 5,
  closerSalePoints: 10,
  closerFollowUpShowPoints: 6,
} as const;

type RankingSettingsValues = {
  callerLeadTakenPoints: number;
  callerAppointmentPoints: number;
  callerShowPoints: number;
  closerSalePoints: number;
  closerFollowUpShowPoints: number;
};

function latestAnswer(items: readonly LeadQASessionItem[], key: string) {
  return [...items].reverse().find((item) => item.questionKey === key)?.answer;
}

async function ensureExistingLeadBackfill() {
  const rows = await db.select().from(leads);
  const values: Array<typeof rankingEvents.$inferInsert> = [];

  for (const lead of rows) {
    const questions = (lead.questions ?? []) as LeadQASessionItem[];
    const callerOutcome = latestAnswer(questions, "callerOutcome");
    const closerOutcome = latestAnswer(questions, "closerOutcome");

    if (lead.callerId) {
      values.push({
        id: crypto.randomUUID(),
        metric: RANKING_METRIC.CALLER_LEAD_TAKEN,
        userId: lead.callerId,
        leadId: lead.id,
        dedupeKey: `${RANKING_METRIC.CALLER_LEAD_TAKEN}:${lead.id}:${lead.callerId}:initial`,
        occurredAt: lead.createdAt,
      });
      if (callerOutcome === "Agenda") {
        values.push({
          id: crypto.randomUUID(),
          metric: RANKING_METRIC.CALLER_APPOINTMENT,
          userId: lead.callerId,
          leadId: lead.id,
          dedupeKey: `${RANKING_METRIC.CALLER_APPOINTMENT}:${lead.id}:${lead.callerId}:initial`,
          occurredAt: lead.updatedAt,
        });
      }
      if (closerOutcome && closerOutcome !== "No-show") {
        values.push({
          id: crypto.randomUUID(),
          metric: RANKING_METRIC.CALLER_SHOW,
          userId: lead.callerId,
          leadId: lead.id,
          dedupeKey: `backfill:${RANKING_METRIC.CALLER_SHOW}:${lead.id}:${lead.callerId}`,
          occurredAt: lead.updatedAt,
        });
      }
    }

    if (lead.closerId && closerOutcome === "Venta") {
      values.push({
        id: crypto.randomUUID(),
        metric: RANKING_METRIC.CLOSER_SALE,
        userId: lead.closerId,
        leadId: lead.id,
        dedupeKey: `backfill:${RANKING_METRIC.CLOSER_SALE}:${lead.id}:${lead.closerId}`,
        occurredAt: lead.updatedAt,
      });
    }
  }

  if (values.length > 0) {
    await db.insert(rankingEvents).values(values).onConflictDoNothing();
  }
}

async function getSettings() {
  await db
    .insert(rankingPointSettings)
    .values(DEFAULT_SETTINGS)
    .onConflictDoNothing();
  const [settings] = await db
    .select()
    .from(rankingPointSettings)
    .where(eq(rankingPointSettings.id, "global"))
    .limit(1);
  return settings ?? DEFAULT_SETTINGS;
}

function settingsToWeights(settings: RankingSettingsValues) {
  return {
    [RANKING_METRIC.CALLER_LEAD_TAKEN]: settings.callerLeadTakenPoints,
    [RANKING_METRIC.CALLER_APPOINTMENT]: settings.callerAppointmentPoints,
    [RANKING_METRIC.CALLER_SHOW]: settings.callerShowPoints,
    [RANKING_METRIC.CLOSER_SALE]: settings.closerSalePoints,
    [RANKING_METRIC.CLOSER_FOLLOW_UP_SHOW]:
      settings.closerFollowUpShowPoints,
  } satisfies Record<RankingMetric, number>;
}

function countsByUser(events: Array<typeof rankingEvents.$inferSelect>) {
  const counts = new Map<string, Partial<Record<RankingMetric, number>>>();
  for (const event of events) {
    const userCounts = counts.get(event.userId) ?? {};
    userCounts[event.metric] = (userCounts[event.metric] ?? 0) + 1;
    counts.set(event.userId, userCounts);
  }
  return counts;
}

function standingsFrom(
  events: Array<typeof rankingEvents.$inferSelect>,
  names: Map<string, string>,
  weights: Record<RankingMetric, number>,
) {
  return [...countsByUser(events)].map(([userId, metrics]) => ({
    userId,
    name: names.get(userId) ?? "Usuario eliminado",
    metrics,
    points: scoreMetrics(metrics, weights),
  })).sort((first, second) =>
    second.points - first.points || first.name.localeCompare(second.name),
  ).map((entry, index) => ({ ...entry, position: index + 1 }));
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function finalizePastMonths(
  names: Map<string, string>,
  weights: Record<RankingMetric, number>,
) {
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);
  const pastEvents = await db
    .select()
    .from(rankingEvents)
    .where(lt(rankingEvents.occurredAt, currentMonthStart))
    .orderBy(asc(rankingEvents.occurredAt));
  const existing = await db.select({ month: rankingMonthlyResults.month }).from(rankingMonthlyResults);
  const existingMonths = new Set(existing.map((result) => result.month));
  const eventsByMonth = new Map<string, Array<typeof rankingEvents.$inferSelect>>();

  for (const event of pastEvents) {
    const key = monthKey(event.occurredAt);
    const monthEvents = eventsByMonth.get(key) ?? [];
    monthEvents.push(event);
    eventsByMonth.set(key, monthEvents);
  }

  for (const [month, monthEvents] of eventsByMonth) {
    if (existingMonths.has(month)) continue;
    const standings = standingsFrom(monthEvents, names, weights);
    if (standings.length > 0) {
      await db.insert(rankingMonthlyResults).values(
        standings.map((standing) => ({
          id: crypto.randomUUID(),
          month,
          userId: standing.userId,
          position: standing.position,
          points: standing.points,
          metrics: standing.metrics,
        })),
      ).onConflictDoNothing();
    }
  }
}

function periodStart(period: RankingPeriod) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "week") {
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
  } else if (period === "fortnight") {
    start.setDate(start.getDate() - 14);
  } else {
    start.setDate(1);
  }
  return start;
}

export async function getRankings(period: RankingPeriod) {
  await ensureExistingLeadBackfill();
  const [settings, users] = await Promise.all([
    getSettings(),
    db.select({ id: user.id, name: user.name }).from(user),
  ]);
  const names = new Map(users.map((entry) => [entry.id, entry.name]));
  const weights = settingsToWeights(settings);
  await finalizePastMonths(names, weights);

  const start = periodStart(period);
  const events = await db
    .select()
    .from(rankingEvents)
    .where(gte(rankingEvents.occurredAt, start))
    .orderBy(asc(rankingEvents.occurredAt));
  const standings = standingsFrom(events, names, weights);
  const categoryPodiums = Object.values(RANKING_METRIC).map((metric) => ({
    metric,
    entries: [...countsByUser(events)]
      .map(([userId, counts]) => ({
        userId,
        name: names.get(userId) ?? "Usuario eliminado",
        value: counts[metric] ?? 0,
      }))
      .filter((entry) => entry.value > 0)
      .sort((first, second) =>
        second.value - first.value || first.name.localeCompare(second.name),
      )
      .slice(0, 3),
  }));

  const historyRows = await db
    .select({
      month: rankingMonthlyResults.month,
      position: rankingMonthlyResults.position,
      points: rankingMonthlyResults.points,
      userId: rankingMonthlyResults.userId,
    })
    .from(rankingMonthlyResults)
    .where(eq(rankingMonthlyResults.position, 1))
    .orderBy(asc(rankingMonthlyResults.month));
  const wins = new Map<string, number>();
  for (const row of historyRows) wins.set(row.userId, (wins.get(row.userId) ?? 0) + 1);

  return {
    period,
    periodStart: start,
    categoryPodiums,
    standings,
    currentLeader: standings[0] ?? null,
    history: historyRows.map((row) => ({
      ...row,
      name: names.get(row.userId) ?? "Usuario eliminado",
    })),
    championshipWins: [...wins]
      .map(([userId, count]) => ({ userId, name: names.get(userId) ?? "Usuario eliminado", count }))
      .sort((first, second) => second.count - first.count),
    settings,
  };
}

export async function updateRankingSettings(
  actorId: string,
  input: RankingSettingsValues,
) {
  const [settings] = await db
    .insert(rankingPointSettings)
    .values({ id: "global", ...input, updatedById: actorId })
    .onConflictDoUpdate({
      target: rankingPointSettings.id,
      set: { ...input, updatedById: actorId, updatedAt: new Date() },
    })
    .returning();
  return settings;
}
