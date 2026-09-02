import type { LeadFinancialEventKind } from "@crm-fran/db/schema/index";

import { buildFinancialTruthProjection, type FinancialTruthEvent } from "../profitability/financial-truth";
import { madridDayKey, normalizeMadridRange } from "../commercial-observatory/domain";

export const COMMERCIAL_PLANNING_POLICY_VERSION = "commercial-planning-v1";
export const PLANNING_HORIZONS = [30, 60, 90] as const;
const DAY_MS = 86_400_000;
const BASELINE_DAYS = 90;
const CONVERSION_MATURITY_DAYS = 30;
const ECONOMIC_MATURITY_DAYS = 90;
const MINIMUM_CONVERSION_SAMPLE = 30;
export type AssumptionOrigin = "observed" | "introduced" | "policy_default";

export type PlanningFinancialEvent = {
  id: string;
  kind: LeadFinancialEventKind;
  amountCents: number;
  currency: string;
  reversalOfId: string | null;
  occurredAt: Date;
};

export type PlanningObservation = {
  leadId: string;
  assignedAt: Date;
  appointmentAt: Date | null;
  soldAt: Date | null;
  financialEvents: readonly PlanningFinancialEvent[];
};

export type PlanningSpendPeriod = {
  id: string;
  periodStart: Date;
  periodEndExclusive: Date;
  spendCents: number;
  currency: string;
};

export type PlanningScenario = {
  leadVolumePerDay?: number;
  appointmentRateBps?: number;
  saleRateBps?: number;
  collectionPerSaleCents?: number;
  refundPerSaleCents?: number;
  directCostPerSaleCents?: number;
  adSpendPerDayCents?: number;
  seasonalityEnabled?: boolean;
  seasonalityFactorBps?: number;
  capacity?: {
    availableCallers?: number;
    callerCapacityPerDay?: number;
    availableClosers?: number;
    closerCapacityPerDay?: number;
    targetUtilizationBps?: number;
  };
  commission?: {
    fixedPerSaleCents?: number;
    collectionsPercentBps?: number;
    callerShareBps?: number;
    goalSales?: number;
    goalBonusCents?: number;
    stretchSales?: number;
    stretchBonusCents?: number;
  };
};

type Assumption<T = number> = { value: T | null; origin: AssumptionOrigin };

const madridDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function madridDateTimeParts(date: Date) {
  const values = Object.fromEntries(madridDateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}

function representedLocalTime(date: Date) {
  const parts = madridDateTimeParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function calendarDayOrdinal(dayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new RangeError("Invalid Madrid calendar day");
  const [year, month, day] = dayKey.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) throw new RangeError("Invalid Madrid calendar day");
  const ordinal = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  if (new Date(ordinal * DAY_MS).toISOString().slice(0, 10) !== dayKey) throw new RangeError("Invalid Madrid calendar day");
  return ordinal;
}

export function madridCalendarDayStart(dayKey: string) {
  const target = calendarDayOrdinal(dayKey) * DAY_MS;
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) guess += target - representedLocalTime(new Date(guess));
  return new Date(guess);
}

export function addMadridCalendarDays(date: Date, days: number) {
  const parts = madridDateTimeParts(date);
  const target = Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second);
  let guess = date.getTime() + days * DAY_MS;
  for (let attempt = 0; attempt < 4; attempt += 1) guess += target - representedLocalTime(new Date(guess));
  return new Date(guess + date.getUTCMilliseconds());
}

export function planningBaselineFrom(cutoff: Date) {
  return addMadridCalendarDays(cutoff, -BASELINE_DAYS);
}

function previousDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) throw new RangeError("Invalid Madrid day key");
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function lastClosedMadridSnapshot(now: Date) {
  const day = previousDayKey(madridDayKey(now));
  const range = normalizeMadridRange({ fromDay: day, toDay: day, now });
  return { day, from: range.from, to: range.to };
}

function dedupeObservations(rows: readonly PlanningObservation[], cutoff: Date) {
  const ordered = rows
    .filter((row) => row.assignedAt < cutoff)
    .sort((left, right) => left.assignedAt.getTime() - right.assignedAt.getTime() || left.leadId.localeCompare(right.leadId));
  const unique = new Map<string, PlanningObservation>();
  for (const row of ordered) if (!unique.has(row.leadId)) unique.set(row.leadId, row);
  return { rows: [...unique.values()], excluded: ordered.length - unique.size };
}

function observed(value: number | null): Assumption {
  return { value, origin: "observed" };
}

function effective(introduced: number | undefined, baseline: Assumption): Assumption {
  return introduced === undefined ? baseline : { value: introduced, origin: "introduced" };
}

function policyDefault(value: number | null): Assumption {
  return { value, origin: "policy_default" };
}

function moneyPerSale(total: number, sales: number) {
  return sales ? Math.round(total / sales) : null;
}

function naturalDaySpan(from: Date, to: Date) {
  const fromKey = madridDayKey(from);
  const toKey = madridDayKey(to);
  const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
  const [toYear, toMonth, toDay] = toKey.split("-").map(Number);
  if (fromYear === undefined || fromMonth === undefined || fromDay === undefined || toYear === undefined || toMonth === undefined || toDay === undefined) return 0;
  return Math.max(0, Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / DAY_MS));
}

function observedSpendPerDay(periods: readonly PlanningSpendPeriod[], currency: string | undefined, from: Date, to: Date) {
  if (!currency) return null;
  const relevant = periods.filter((period) => period.currency === currency && period.periodStart < to && period.periodEndExclusive > from);
  const days = naturalDaySpan(from, to);
  if (!relevant.length || !days) return null;
  let spend = 0;
  for (let index = 0; index < days; index += 1) {
    const dayStart = addMadridCalendarDays(from, index);
    const dayEnd = addMadridCalendarDays(from, index + 1);
    const covering = relevant.filter((period) => period.periodStart < dayEnd && period.periodEndExclusive > dayStart);
    if (!covering.length) return null;
    for (const period of covering) {
      const totalDays = naturalDaySpan(period.periodStart, period.periodEndExclusive);
      if (!totalDays) return null;
      spend += period.spendCents / totalDays;
    }
  }
  return Math.round(spend / days);
}

function buildBaseline(input: {
  rows: readonly PlanningObservation[];
  spendPeriods: readonly PlanningSpendPeriod[];
  asOf: Date;
  currency?: string;
}) {
  const volumeFrom = addMadridCalendarDays(input.asOf, -BASELINE_DAYS);
  const conversionTo = addMadridCalendarDays(input.asOf, -CONVERSION_MATURITY_DAYS);
  const conversionFrom = addMadridCalendarDays(conversionTo, -BASELINE_DAYS);
  const economicTo = addMadridCalendarDays(input.asOf, -ECONOMIC_MATURITY_DAYS);
  const economicFrom = addMadridCalendarDays(economicTo, -2 * BASELINE_DAYS);
  const volumeRows = input.rows.filter((row) => row.assignedAt >= volumeFrom && row.assignedAt < input.asOf);
  const conversionRows = input.rows.filter((row) => row.assignedAt >= conversionFrom && row.assignedAt < conversionTo);
  const allEconomicRows = input.rows.filter((row) => row.assignedAt >= economicFrom && row.assignedAt < economicTo);
  const conversionDeadline = (row: PlanningObservation) => addMadridCalendarDays(row.assignedAt, CONVERSION_MATURITY_DAYS);
  const economicDeadline = (row: PlanningObservation) => addMadridCalendarDays(row.assignedAt, ECONOMIC_MATURITY_DAYS);
  const economicRows = input.currency ? allEconomicRows.filter((row) => row.financialEvents.some((event) => event.currency === input.currency && event.occurredAt < economicDeadline(row) && event.occurredAt < input.asOf)) : [];
  const appointments = conversionRows.filter((row) => row.appointmentAt !== null && row.appointmentAt < conversionDeadline(row)).length;
  const sales = conversionRows.filter((row) => row.soldAt !== null && row.soldAt < conversionDeadline(row)).length;
  const economicSales = economicRows.filter((row) => row.soldAt !== null && row.soldAt < economicDeadline(row)).length;
  const events = new Map<string, FinancialTruthEvent>();
  if (input.currency) {
    for (const row of economicRows) for (const event of row.financialEvents) {
      if (event.currency === input.currency && event.occurredAt < economicDeadline(row) && event.occurredAt < input.asOf) events.set(event.id, event);
    }
  }
  const financialProjection = input.currency ? buildFinancialTruthProjection([...events.values()]).find((row) => row.currency === input.currency) : undefined;
  const financial = input.currency && events.size ? financialProjection ?? {
    currency: input.currency,
    grossContractedCents: 0,
    discountsCents: 0,
    netContractedCents: 0,
    paymentsCents: 0,
    refundsAndChargebacksCents: 0,
    realizedCashCents: 0,
    commissionsCents: 0,
    directCostsCents: 0,
    realizedMarginBeforeAdsCents: 0,
    outstandingContractedBalanceCents: 0,
  } : undefined;
  const assumptions = {
    leadVolumePerDay: observed(volumeRows.length ? Math.round(volumeRows.length / BASELINE_DAYS * 100) / 100 : null),
    appointmentRateBps: observed(conversionRows.length ? Math.round(appointments / conversionRows.length * 10_000) : null),
    saleRateBps: observed(conversionRows.length ? Math.round(sales / conversionRows.length * 10_000) : null),
    collectionPerSaleCents: observed(financial ? moneyPerSale(financial.paymentsCents, economicSales) : null),
    refundPerSaleCents: observed(financial ? moneyPerSale(financial.refundsAndChargebacksCents, economicSales) : null),
    directCostPerSaleCents: observed(financial ? moneyPerSale(financial.directCostsCents, economicSales) : null),
    commissionPerSaleCents: observed(financial ? moneyPerSale(financial.commissionsCents, economicSales) : null),
    adSpendPerDayCents: observed(observedSpendPerDay(input.spendPeriods, input.currency, volumeFrom, input.asOf)),
    seasonalityEnabled: { value: false, origin: "policy_default" as const },
    seasonalityFactorBps: policyDefault(10_000),
  };
  const status = conversionRows.length >= MINIMUM_CONVERSION_SAMPLE && Object.values(assumptions).every((item) => item.value !== null)
    ? "available" as const
    : "insufficient_evidence" as const;
  return {
    status,
    assumptions,
    coverage: {
      volume: volumeRows.length,
      conversionMature: conversionRows.length,
      economicMature: economicRows.length,
      economicSales,
      financialEvents: events.size,
      minimumConversionSample: MINIMUM_CONVERSION_SAMPLE,
      conversionMaturityDays: CONVERSION_MATURITY_DAYS,
      economicMaturityDays: ECONOMIC_MATURITY_DAYS,
    },
    rule: `Base observada: volumen de ${BASELINE_DAYS} días cerrados, conversión madura a ${CONVERSION_MATURITY_DAYS} días y economía madura a ${ECONOMIC_MATURITY_DAYS} días.`,
  };
}

type ForecastAssumptions = {
  leadVolumePerDay: Assumption;
  appointmentRateBps: Assumption;
  saleRateBps: Assumption;
  collectionPerSaleCents: Assumption;
  refundPerSaleCents: Assumption;
  directCostPerSaleCents: Assumption;
  adSpendPerDayCents: Assumption;
  seasonalityEnabled: { value: boolean; origin: AssumptionOrigin };
  seasonalityFactorBps: Assumption;
};

function completeForecastAssumptions(assumptions: ForecastAssumptions) {
  return assumptions.leadVolumePerDay.value !== null && assumptions.appointmentRateBps.value !== null && assumptions.saleRateBps.value !== null && assumptions.collectionPerSaleCents.value !== null && assumptions.refundPerSaleCents.value !== null && assumptions.directCostPerSaleCents.value !== null && assumptions.adSpendPerDayCents.value !== null && assumptions.seasonalityFactorBps.value !== null;
}

function safeInteger(value: number, label: string) {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) throw new RangeError(`${label} exceeds safe integer arithmetic`);
  return rounded;
}

function commissionFor(sales: number, collectionsCents: number, config: PlanningScenario["commission"], observedCommissionPerSaleCents: number | null) {
  const fixedPerSaleCents = config?.fixedPerSaleCents !== undefined ? { value: config.fixedPerSaleCents, origin: "introduced" as const } : observedCommissionPerSaleCents !== null ? observed(observedCommissionPerSaleCents) : policyDefault(0);
  const collectionsPercentBps = config?.collectionsPercentBps !== undefined ? { value: config.collectionsPercentBps, origin: "introduced" as const } : policyDefault(0);
  const callerShareBps = config?.callerShareBps !== undefined ? { value: config.callerShareBps, origin: "introduced" as const } : policyDefault(null);
  const goalSales = config?.goalSales !== undefined ? { value: config.goalSales, origin: "introduced" as const } : policyDefault(null);
  const goalBonusCents = config?.goalBonusCents !== undefined ? { value: config.goalBonusCents, origin: "introduced" as const } : policyDefault(0);
  const stretchSales = config?.stretchSales !== undefined ? { value: config.stretchSales, origin: "introduced" as const } : policyDefault(null);
  const stretchBonusCents = config?.stretchBonusCents !== undefined ? { value: config.stretchBonusCents, origin: "introduced" as const } : policyDefault(0);
  const bonusTier = stretchSales.value !== null && sales >= stretchSales.value ? "stretch" as const : goalSales.value !== null && sales >= goalSales.value ? "goal" as const : "none" as const;
  const bonusCents = bonusTier === "stretch" ? stretchBonusCents.value ?? 0 : bonusTier === "goal" ? goalBonusCents.value ?? 0 : 0;
  const fixedCents = safeInteger(sales * (fixedPerSaleCents.value ?? 0), "fixed commission");
  const percentageCents = safeInteger(collectionsCents * (collectionsPercentBps.value ?? 0) / 10_000, "collection commission");
  const totalCents = safeInteger(fixedCents + percentageCents + bonusCents, "total commission");
  const callersCents = callerShareBps.value === null ? null : safeInteger(totalCents * callerShareBps.value / 10_000, "caller commission");
  return {
    status: callersCents === null ? "partial" as const : "available" as const,
    totalCents,
    callersCents,
    closersCents: callersCents === null ? null : totalCents - callersCents,
    bonusTier,
    assumptions: { fixedPerSaleCents, collectionsPercentBps, callerShareBps, goalSales, goalBonusCents, stretchSales, stretchBonusCents },
    rule: "Cada campo introducido se aplica por separado. Los demás muestran fallback observed o policy_default; el reparto caller/closer requiere un supuesto porque el ledger no identifica destinatario.",
  };
}

function forecastFor(days: typeof PLANNING_HORIZONS[number], assumptions: ForecastAssumptions, commission: PlanningScenario["commission"], observedCommissionPerSaleCents: number | null) {
  const leadVolumePerDay = assumptions.leadVolumePerDay.value;
  const appointmentRateBps = assumptions.appointmentRateBps.value;
  const saleRateBps = assumptions.saleRateBps.value;
  const collectionPerSaleCents = assumptions.collectionPerSaleCents.value;
  const refundPerSaleCents = assumptions.refundPerSaleCents.value;
  const directCostPerSaleCents = assumptions.directCostPerSaleCents.value;
  const adSpendPerDayCents = assumptions.adSpendPerDayCents.value;
  const seasonalityFactorBps = assumptions.seasonalityFactorBps.value;
  if (!completeForecastAssumptions(assumptions) || leadVolumePerDay === null || appointmentRateBps === null || saleRateBps === null || collectionPerSaleCents === null || refundPerSaleCents === null || directCostPerSaleCents === null || adSpendPerDayCents === null || seasonalityFactorBps === null) return null;
  const factor = assumptions.seasonalityEnabled.value ? seasonalityFactorBps / 10_000 : 1;
  const leads = safeInteger(leadVolumePerDay * days * factor, "forecast leads");
  const appointments = safeInteger(leads * appointmentRateBps / 10_000, "forecast appointments");
  const sales = safeInteger(leads * saleRateBps / 10_000, "forecast sales");
  const collectionsCents = safeInteger(sales * collectionPerSaleCents, "forecast collections");
  const refundsCents = safeInteger(sales * refundPerSaleCents, "forecast refunds");
  const directCostsCents = safeInteger(sales * directCostPerSaleCents, "forecast direct costs");
  const adSpendCents = safeInteger(days * adSpendPerDayCents, "forecast advertising spend");
  const commissionResult = commissionFor(sales, collectionsCents, commission, observedCommissionPerSaleCents);
  if (commissionResult.totalCents === null) return null;
  const commissionsCents = commissionResult.totalCents;
  return { days, leads, appointments, sales, collectionsCents, refundsCents, directCostsCents, commissionsCents, adSpendCents, marginBeforeUnmodeledCostsCents: safeInteger(collectionsCents - refundsCents - directCostsCents - commissionsCents - adSpendCents, "forecast margin"), commission: commissionResult };
}

function capacityFor(days: typeof PLANNING_HORIZONS[number], forecast: NonNullable<ReturnType<typeof forecastFor>>, config: PlanningScenario["capacity"]) {
  const availableCallers = config?.availableCallers;
  const callerCapacityPerDay = config?.callerCapacityPerDay;
  const availableClosers = config?.availableClosers;
  const closerCapacityPerDay = config?.closerCapacityPerDay;
  const targetUtilizationBps = config?.targetUtilizationBps;
  if (availableCallers === undefined || callerCapacityPerDay === undefined || availableClosers === undefined || closerCapacityPerDay === undefined || targetUtilizationBps === undefined || callerCapacityPerDay <= 0 || closerCapacityPerDay <= 0 || targetUtilizationBps <= 0) return { days, status: "insufficient_evidence" as const, callers: null, closers: null, rule: "Introduce disponibilidad real, capacidad por persona y umbral de utilización; las cuentas configuradas no se tratan como activas." };
  const role = (demand: number, available: number, perDay: number) => {
    const nominalCapacity = safeInteger(available * perDay * days, "nominal capacity");
    const usablePerPerson = perDay * days * targetUtilizationBps / 10_000;
    const effectiveCapacity = safeInteger(nominalCapacity * targetUtilizationBps / 10_000, "effective capacity");
    const peopleRequired = Math.ceil(demand / usablePerPerson);
    return { demand, availablePeople: available, nominalCapacity, effectiveCapacity, utilizationBps: effectiveCapacity ? Math.round(demand / effectiveCapacity * 10_000) : null, deficitUnits: Math.max(0, demand - effectiveCapacity), excessUnits: Math.max(0, effectiveCapacity - demand), peopleRequired, hiresSuggested: Math.max(0, peopleRequired - available), rule: `Capacidad efectiva = capacidad nominal × ${targetUtilizationBps / 100}%. Personas requeridas = ceil(demanda / capacidad efectiva por persona); no crea usuarios ni asigna leads.` };
  };
  return { days, status: "available" as const, callers: role(forecast.leads, availableCallers, callerCapacityPerDay), closers: role(forecast.appointments, availableClosers, closerCapacityPerDay), rule: "Callers dimensionados por leads y closers por agendas; disponibilidad real introducida por administración." };
}

function withDeltas(scenario: readonly NonNullable<ReturnType<typeof forecastFor>>[], baseline: readonly NonNullable<ReturnType<typeof forecastFor>>[]) {
  return scenario.map((row) => {
    const base = baseline.find((item) => item.days === row.days);
    return { ...row, delta: { leads: base ? row.leads - base.leads : null, appointments: base ? row.appointments - base.appointments : null, sales: base ? row.sales - base.sales : null, marginBeforeUnmodeledCostsCents: base ? row.marginBeforeUnmodeledCostsCents - base.marginBeforeUnmodeledCostsCents : null } };
  });
}

export function buildCommercialPlanning(input: { observations: readonly PlanningObservation[]; spendPeriods?: readonly PlanningSpendPeriod[]; currency?: string; scenario: PlanningScenario; asOf: Date }) {
  const deduped = dedupeObservations(input.observations, input.asOf);
  const spendPeriods = input.spendPeriods ?? [];
  const relevantSpendPeriods = spendPeriods.filter((period) => period.periodStart < input.asOf && period.periodEndExclusive > planningBaselineFrom(input.asOf));
  const currencies = [...new Set([...deduped.rows.flatMap((row) => row.financialEvents.filter((event) => event.occurredAt < input.asOf).map((event) => event.currency)), ...relevantSpendPeriods.map((period) => period.currency)])].sort();
  const economicStatus = !input.currency && currencies.length ? "currency_required" as const : input.currency && !currencies.includes(input.currency) && currencies.length ? "not_comparable" as const : currencies.length ? "available" as const : "insufficient_evidence" as const;
  const baseline = buildBaseline({ rows: deduped.rows, spendPeriods: relevantSpendPeriods, asOf: input.asOf, currency: input.currency });
  const baselineAssumptions: ForecastAssumptions = {
    leadVolumePerDay: baseline.assumptions.leadVolumePerDay,
    appointmentRateBps: baseline.assumptions.appointmentRateBps,
    saleRateBps: baseline.assumptions.saleRateBps,
    collectionPerSaleCents: baseline.assumptions.collectionPerSaleCents,
    refundPerSaleCents: baseline.assumptions.refundPerSaleCents,
    directCostPerSaleCents: baseline.assumptions.directCostPerSaleCents,
    adSpendPerDayCents: baseline.assumptions.adSpendPerDayCents,
    seasonalityEnabled: { value: false, origin: "policy_default" },
    seasonalityFactorBps: baseline.assumptions.seasonalityFactorBps,
  };
  const scenarioAssumptions: ForecastAssumptions = {
    leadVolumePerDay: effective(input.scenario.leadVolumePerDay, baselineAssumptions.leadVolumePerDay),
    appointmentRateBps: effective(input.scenario.appointmentRateBps, baselineAssumptions.appointmentRateBps),
    saleRateBps: effective(input.scenario.saleRateBps, baselineAssumptions.saleRateBps),
    collectionPerSaleCents: effective(input.scenario.collectionPerSaleCents, baselineAssumptions.collectionPerSaleCents),
    refundPerSaleCents: effective(input.scenario.refundPerSaleCents, baselineAssumptions.refundPerSaleCents),
    directCostPerSaleCents: effective(input.scenario.directCostPerSaleCents, baselineAssumptions.directCostPerSaleCents),
    adSpendPerDayCents: effective(input.scenario.adSpendPerDayCents, baselineAssumptions.adSpendPerDayCents),
    seasonalityEnabled: input.scenario.seasonalityEnabled === undefined ? { value: false, origin: "policy_default" } : { value: input.scenario.seasonalityEnabled, origin: "introduced" },
    seasonalityFactorBps: effective(input.scenario.seasonalityFactorBps, baselineAssumptions.seasonalityFactorBps),
  };
  const baselineForecast = baseline.status === "available" ? PLANNING_HORIZONS.flatMap((days) => forecastFor(days, baselineAssumptions, undefined, baseline.assumptions.commissionPerSaleCents.value) ?? []) : [];
  const rawScenarioForecast = PLANNING_HORIZONS.flatMap((days) => forecastFor(days, scenarioAssumptions, input.scenario.commission, baseline.assumptions.commissionPerSaleCents.value) ?? []);
  const scenarioForecast = withDeltas(rawScenarioForecast, baselineForecast);
  const sensitivity = ([{ key: "downside", factorBps: 8_000 }, { key: "base", factorBps: 10_000 }, { key: "upside", factorBps: 12_000 }] as const).map(({ key, factorBps }) => {
    const changed = { ...scenarioAssumptions, leadVolumePerDay: { ...scenarioAssumptions.leadVolumePerDay, value: scenarioAssumptions.leadVolumePerDay.value === null ? null : scenarioAssumptions.leadVolumePerDay.value * factorBps / 10_000 }, saleRateBps: { ...scenarioAssumptions.saleRateBps, value: scenarioAssumptions.saleRateBps.value === null ? null : Math.min(10_000, Math.round(scenarioAssumptions.saleRateBps.value * factorBps / 10_000)) } };
    const forecast = forecastFor(90, changed, input.scenario.commission, baseline.assumptions.commissionPerSaleCents.value);
    return { key, factorBps, days: 90 as const, sales: forecast?.sales ?? null, marginBeforeUnmodeledCostsCents: forecast?.marginBeforeUnmodeledCostsCents ?? null, rule: "Sensibilidad conjunta de volumen y tasa de venta ±20%; no es intervalo de confianza." };
  });
  return {
    policyVersion: COMMERCIAL_PLANNING_POLICY_VERSION,
    generatedAt: input.asOf,
    timeZone: "Europe/Madrid" as const,
    availableCurrencies: currencies,
    currency: input.currency ?? null,
    economicStatus,
    coverage: { observations: deduped.rows.length, duplicateObservationsExcluded: deduped.excluded },
    baseline: { ...baseline, forecast: baselineForecast },
    scenario: { status: scenarioForecast.length === PLANNING_HORIZONS.length ? "available" as const : "insufficient_evidence" as const, assumptions: scenarioAssumptions, forecast: scenarioForecast, sensitivity, capacity: scenarioForecast.map((row) => capacityFor(row.days, row, input.scenario.capacity)), commissionPolicy: input.scenario.commission ?? null },
    notice: "Simulación condicionada a supuestos visibles. No es una predicción ni un compromiso; el margen es antes de costes no modelados.",
  };
}
