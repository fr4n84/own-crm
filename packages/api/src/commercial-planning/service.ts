import { and, db, lt, sql } from "@crm-fran/db";
import { campaignSpendPeriods } from "@crm-fran/db/schema/index";

import { loadCommercialEvidenceData } from "../commercial-evidence/service";
import { buildCommercialPlanning, lastClosedMadridSnapshot, planningBaselineFrom, type PlanningScenario, type PlanningSpendPeriod } from "./domain";
import { buildPlanningObservations, normalizePlanningSpendPeriods } from "./facts";

export function filterRelevantPlanningSpendPeriods(periods: readonly PlanningSpendPeriod[], cutoff: Date) {
  const from = planningBaselineFrom(cutoff);
  return periods.filter((period) => period.periodStart < cutoff && period.periodEndExclusive > from);
}

export async function getCommercialPlanning(input: { currency?: string; scenario: PlanningScenario }, now = new Date()) {
  const snapshot = lastClosedMadridSnapshot(now);
  const spendFrom = planningBaselineFrom(snapshot.to);
  const [{ leadRows, activityRows, financialRows }, spendPeriods] = await Promise.all([
    loadCommercialEvidenceData(snapshot.to),
    db.select({ id: campaignSpendPeriods.id, periodStart: campaignSpendPeriods.periodStart, periodEnd: campaignSpendPeriods.periodEnd, spendCents: campaignSpendPeriods.spendCents, currency: campaignSpendPeriods.currency }).from(campaignSpendPeriods).where(and(lt(campaignSpendPeriods.periodStart, snapshot.to), sql`${campaignSpendPeriods.periodEnd} > ${spendFrom}`)),
  ]);
  const observations = buildPlanningObservations({ leads: leadRows, activities: activityRows, financial: financialRows, cutoff: snapshot.to });
  const normalizedSpendPeriods = normalizePlanningSpendPeriods(spendPeriods);
  return {
    snapshot,
    ...buildCommercialPlanning({ observations, spendPeriods: filterRelevantPlanningSpendPeriods(normalizedSpendPeriods, snapshot.to), currency: input.currency, scenario: input.scenario, asOf: snapshot.to }),
  };
}
