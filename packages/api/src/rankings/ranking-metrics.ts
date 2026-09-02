import {
  RANKING_METRIC,
  type RankingMetric,
} from "@crm-fran/db/schema/index";

export { RANKING_METRIC };

const ATTENDED_OUTCOMES = new Set([
  "Agenda",
  "Reagenda",
  "Seguimiento",
  "Venta",
  "No interesado",
]);

export function deriveCloserRankingMetrics(
  previousOutcome: string | undefined,
  nextOutcome: string | undefined,
): RankingMetric[] {
  if (!nextOutcome || !ATTENDED_OUTCOMES.has(nextOutcome)) return [];

  const metrics: RankingMetric[] = [RANKING_METRIC.CALLER_SHOW];
  if (nextOutcome === "Venta") metrics.push(RANKING_METRIC.CLOSER_SALE);
  if (previousOutcome === "Seguimiento" && nextOutcome !== "Seguimiento") {
    metrics.push(RANKING_METRIC.CLOSER_FOLLOW_UP_SHOW);
  }
  return metrics;
}

export function scoreMetrics(
  counts: Partial<Record<RankingMetric, number>>,
  weights: Partial<Record<RankingMetric, number>>,
) {
  return Object.entries(counts).reduce(
    (total, [metric, count]) =>
      total + (count ?? 0) * (weights[metric as RankingMetric] ?? 0),
    0,
  );
}
