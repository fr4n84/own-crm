import type { LeadFinancialEventKind } from "@crm-fran/db/schema/index";

import { buildFinancialTruthProjection, type FinancialTruthEvent } from "../profitability/financial-truth";

export const COMMERCIAL_OBSERVATORY_POLICY_VERSION = "commercial-observatory-v1";
export const COMMERCIAL_OBSERVATORY_TIME_ZONE = "Europe/Madrid";
export const CONVERSION_MATURITY_DAYS = 30;

export type EvidenceState = "available" | "insufficient_evidence" | "currency_required" | "not_comparable";
export type AnomalyState = "anomaly" | "within_expected_range" | "insufficient_evidence";

export type ObservatoryFinancialEvent = {
  id: string;
  kind: LeadFinancialEventKind;
  amountCents: number;
  currency: string;
  reversalOfId: string | null;
  occurredAt: Date;
};

export type ObservatoryObservation = {
  leadId: string;
  assignedAt: Date;
  soldAt: Date | null;
  source: string | null;
  campaign: string | null;
  callerId: string | null;
  closerId: string | null;
  callerLabel?: string | null;
  closerLabel?: string | null;
  profile: string | null;
  financialEvents: readonly ObservatoryFinancialEvent[];
};

type BuildInput = {
  observations: readonly ObservatoryObservation[];
  from: Date;
  to: Date;
  asOf: Date;
  currency?: string;
};

const DAY_MS = 86_400_000;
const madridFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMMERCIAL_OBSERVATORY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function madridDayKey(date: Date) {
  const parts = Object.fromEntries(madridFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const madridDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: COMMERCIAL_OBSERVATORY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function dateOrdinal(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / DAY_MS);
}

function ordinalKey(ordinal: number) {
  return new Date(ordinal * DAY_MS).toISOString().slice(0, 10);
}

function isCalendarDayKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && ordinalKey(dateOrdinal(value)) === value;
}

function madridMidnight(dayKey: string) {
  if (!isCalendarDayKey(dayKey)) throw new RangeError("Invalid Madrid calendar day");
  const target = dateOrdinal(dayKey) * DAY_MS;
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(madridDateTimeFormatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += target - represented;
  }
  return new Date(guess);
}

export function normalizeMadridRange(input: { fromDay: string; toDay: string; now: Date }) {
  if (!isCalendarDayKey(input.fromDay) || !isCalendarDayKey(input.toDay) || input.fromDay > input.toDay) throw new RangeError("Invalid calendar range");
  const today = madridDayKey(input.now);
  if (input.toDay > today) throw new RangeError("Future calendar days are not allowed");
  const requestedExclusiveOrdinal = dateOrdinal(input.toDay) + 1;
  const closedExclusiveOrdinal = Math.min(requestedExclusiveOrdinal, dateOrdinal(today));
  const from = madridMidnight(input.fromDay);
  const to = madridMidnight(ordinalKey(closedExclusiveOrdinal));
  if (from >= to) throw new RangeError("Range has no closed Madrid days");
  return { from, to, requestedFromDay: input.fromDay, requestedToDay: input.toDay, lastClosedDay: ordinalKey(closedExclusiveOrdinal - 1) };
}

function madridWeekKey(dayKey: string) {
  const ordinal = dateOrdinal(dayKey);
  const weekday = new Date(ordinal * DAY_MS).getUTCDay();
  return ordinalKey(ordinal - ((weekday + 6) % 7));
}

function priorComparableRange(from: Date, to: Date) {
  const fromOrdinal = dateOrdinal(madridDayKey(from));
  const toOrdinal = dateOrdinal(madridDayKey(to));
  const durationDays = toOrdinal - fromOrdinal;
  return { from: madridMidnight(ordinalKey(fromOrdinal - durationDays)), to: from, durationDays };
}

function median(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function quantile(values: readonly number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function wilson(successes: number, sample: number) {
  if (!sample) return null;
  const z = 1.96;
  const p = successes / sample;
  const denominator = 1 + z ** 2 / sample;
  const centre = (p + z ** 2 / (2 * sample)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * sample)) / sample) / denominator;
  return { lowBps: Math.round(Math.max(0, centre - margin) * 10_000), highBps: Math.round(Math.min(1, centre + margin) * 10_000) };
}

function dedupeObservations(rows: readonly ObservatoryObservation[], asOf: Date) {
  const ordered = rows
    .filter((row) => row.assignedAt <= asOf)
    .sort((left, right) => left.assignedAt.getTime() - right.assignedAt.getTime() || left.leadId.localeCompare(right.leadId));
  const unique = new Map<string, ObservatoryObservation>();
  for (const row of ordered) if (!unique.has(row.leadId)) unique.set(row.leadId, row);
  return { rows: [...unique.values()], duplicates: ordered.length - unique.size };
}

function inRange(row: ObservatoryObservation, from: Date, to: Date) {
  return row.assignedAt >= from && row.assignedAt < to;
}

function soldBy(row: ObservatoryObservation, cutoff: Date) {
  return row.soldAt !== null && row.soldAt < cutoff;
}

function matureBy(row: ObservatoryObservation, cutoff: Date) {
  return row.assignedAt.getTime() <= cutoff.getTime() - CONVERSION_MATURITY_DAYS * DAY_MS;
}

function cohortStats(rows: readonly ObservatoryObservation[], from: Date, to: Date, evaluationAt: Date) {
  const volumeRows = rows.filter((row) => inRange(row, from, to));
  const matureRows = volumeRows.filter((row) => matureBy(row, evaluationAt));
  const sales = matureRows.filter((row) => soldBy(row, evaluationAt)).length;
  return {
    volume: volumeRows.length,
    sample: matureRows.length,
    sales,
    conversionBps: matureRows.length ? Math.round((sales / matureRows.length) * 10_000) : null,
    wilson95: wilson(sales, matureRows.length),
  };
}

function commercialBridge(rows: readonly ObservatoryObservation[], from: Date, to: Date) {
  const baselineRange = priorComparableRange(from, to);
  const baselineFrom = baselineRange.from;
  const current = cohortStats(rows, from, to, to);
  const baseline = cohortStats(rows, baselineFrom, from, from);
  const deltaSales = current.sales - baseline.sales;
  if (!current.sample || !baseline.sample) {
    return { status: "insufficient_evidence" as const, current, baseline, baselineFrom, baselineTo: from, deltaSales, volumeContribution: 0, conversionContribution: deltaSales, rule: `Conversión madura a ${CONVERSION_MATURITY_DAYS} días; baseline estrictamente anterior de igual duración.` };
  }
  const currentRate = current.sales / current.sample;
  const baselineRate = baseline.sales / baseline.sample;
  const volumeContribution = (current.sample - baseline.sample) * ((currentRate + baselineRate) / 2);
  const conversionContribution = deltaSales - volumeContribution;
  return { status: "available" as const, current, baseline, baselineFrom, baselineTo: from, deltaSales, volumeContribution, conversionContribution, rule: `Descomposición simétrica: Δvolumen × tasa media + Δtasa × volumen medio. Madurez ${CONVERSION_MATURITY_DAYS} días.` };
}

function projectionFor(rows: readonly ObservatoryObservation[], from: Date, to: Date, asOf: Date, currency: string) {
  const events = new Map<string, FinancialTruthEvent>();
  for (const row of rows.filter((item) => inRange(item, from, to))) {
    for (const event of row.financialEvents) {
      if (event.currency === currency && event.occurredAt < asOf) events.set(event.id, event);
    }
  }
  const projection = buildFinancialTruthProjection([...events.values()]).find((row) => row.currency === currency);
  return { eventCount: events.size, projection: projection ?? {
    currency,
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
  } };
}

function economicBridge(rows: readonly ObservatoryObservation[], from: Date, to: Date, currencies: readonly string[], currency?: string) {
  if (!currency && currencies.length) return { status: "currency_required" as const, availableCurrencies: currencies, rule: "Hay varias monedas en los periodos comparados; la evidencia se mantiene separada y no existe conversión FX implícita." };
  if (!currency) return { status: "insufficient_evidence" as const, availableCurrencies: currencies, rule: "No existen eventos económicos registrados." };
  if (!currencies.includes(currency)) return { status: "not_comparable" as const, availableCurrencies: currencies, rule: `No hay verdad económica comparable en ${currency}.` };
  const baselineFrom = priorComparableRange(from, to).from;
  const baselineResult = projectionFor(rows, baselineFrom, from, from, currency);
  const currentResult = projectionFor(rows, from, to, to, currency);
  if (baselineResult.eventCount === 0 && currentResult.eventCount === 0) return { status: "insufficient_evidence" as const, availableCurrencies: currencies, rule: `No existen eventos económicos relevantes en ${currency} dentro de los periodos comparados.` };
  const baseline = baselineResult.projection;
  const current = currentResult.projection;
  const deltaMarginCents = current.realizedMarginBeforeAdsCents - baseline.realizedMarginBeforeAdsCents;
  const contributions = [
    { key: "payments", label: "Cobros", amountCents: current.paymentsCents - baseline.paymentsCents },
    { key: "refunds", label: "Reembolsos y chargebacks", amountCents: -(current.refundsAndChargebacksCents - baseline.refundsAndChargebacksCents) },
    { key: "commissions", label: "Comisiones", amountCents: -(current.commissionsCents - baseline.commissionsCents) },
    { key: "costs", label: "Costes directos", amountCents: -(current.directCostsCents - baseline.directCostsCents) },
  ];
  const subtotal = contributions.reduce((sum, row) => sum + row.amountCents, 0);
  if (subtotal !== deltaMarginCents) contributions.push({ key: "rounding", label: "Ajuste aritmético", amountCents: deltaMarginCents - subtotal });
  return {
    status: "available" as const,
    currency,
    availableCurrencies: currencies,
    baseline: { marginCents: baseline.realizedMarginBeforeAdsCents },
    current: { marginCents: current.realizedMarginBeforeAdsCents },
    deltaMarginCents,
    contributions,
    rule: "Waterfall de proyecciones acumuladas as-of; las reversiones anulan el evento original solo desde su fecha.",
  };
}

function distribution(values: readonly number[]) {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  return { median: median(values), q1, q3, iqr: q1 === null || q3 === null ? null : q3 - q1, sample: values.length };
}

function seasonality(rows: readonly ObservatoryObservation[], from: Date, to: Date) {
  const closedToOrdinal = dateOrdinal(madridDayKey(to));
  const fromOrdinal = dateOrdinal(madridDayKey(from));
  const fromWeekday = new Date(fromOrdinal * DAY_MS).getUTCDay();
  const firstFullWeek = fromOrdinal + ((8 - fromWeekday) % 7);
  const values = new Map<string, { volume: number; matureSample: number; sales: number }>();
  for (let week = firstFullWeek; week + 7 <= closedToOrdinal; week += 7) {
    for (let ordinal = week; ordinal < week + 7; ordinal += 1) values.set(ordinalKey(ordinal), { volume: 0, matureSample: 0, sales: 0 });
  }
  for (const row of rows) {
    const key = madridDayKey(row.assignedAt);
    const bucket = values.get(key);
    if (!bucket) continue;
    bucket.volume += 1;
    if (matureBy(row, to)) {
      bucket.matureSample += 1;
      if (soldBy(row, to)) bucket.sales += 1;
    }
  }
  const weekdayGroups = new Map<number, { volume: number; conversionBps: number }[]>();
  const weekGroups = new Map<string, { volume: number; matureSample: number; sales: number }>();
  for (const [key, value] of values) {
    const weekday = new Date(dateOrdinal(key) * DAY_MS).getUTCDay();
    const weekdays = weekdayGroups.get(weekday) ?? [];
    weekdays.push({ volume: value.volume, conversionBps: value.matureSample ? Math.round(value.sales / value.matureSample * 10_000) : Number.NaN });
    weekdayGroups.set(weekday, weekdays);
    const weekKey = madridWeekKey(key);
    const week = weekGroups.get(weekKey) ?? { volume: 0, matureSample: 0, sales: 0 };
    week.volume += value.volume;
    week.matureSample += value.matureSample;
    week.sales += value.sales;
    weekGroups.set(weekKey, week);
  }
  const weekdayLabels = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const byWeekday = [...weekdayGroups].sort(([left], [right]) => left - right).map(([weekday, samples]) => ({
    weekday,
    label: weekdayLabels[weekday]!,
    volume: distribution(samples.map((row) => row.volume)),
    conversionBps: distribution(samples.map((row) => row.conversionBps).filter(Number.isFinite)),
  }));
  const byWeek = [...weekGroups].sort(([left], [right]) => left.localeCompare(right)).map(([week, value]) => ({ week, volume: value.volume, matureSample: value.matureSample, sales: value.sales, conversionBps: value.matureSample ? Math.round(value.sales / value.matureSample * 10_000) : null }));
  const sampleDays = [...values.values()].filter((value) => value.volume > 0).length;
  const sampleWeeks = byWeek.filter((value) => value.volume > 0).length;
  const observations = [...values.values()].reduce((sum, value) => sum + value.volume, 0);
  const status: EvidenceState = observations > 0 && sampleDays >= 28 && sampleWeeks >= 4 ? "available" : "insufficient_evidence";
  return { status, byWeekday, byWeek, sampleDays, sampleWeeks, observations, minimum: "28 días cerrados con observaciones y 4 semanas completas con actividad", range: { from, to }, rule: `Solo semanas completas y cerradas en ${COMMERCIAL_OBSERVATORY_TIME_ZONE}; mediana e IQR descriptivos, sin inferencia causal.` };
}

type GroupSpec = { scope: "global" | "source" | "campaign"; key: string; label: string; predicate: (row: ObservatoryObservation) => boolean };

function anomalyGroups(rows: readonly ObservatoryObservation[]) {
  const groups: GroupSpec[] = [{ scope: "global", key: "global", label: "Global", predicate: () => true }];
  for (const value of [...new Set(rows.map((row) => row.source ?? "Sin atribución"))].sort()) groups.push({ scope: "source", key: `source:${value}`, label: value, predicate: (row) => (row.source ?? "Sin atribución") === value });
  for (const value of [...new Set(rows.map((row) => row.campaign ?? "Sin atribución"))].sort()) groups.push({ scope: "campaign", key: `campaign:${value}`, label: value, predicate: (row) => (row.campaign ?? "Sin atribución") === value });
  return groups;
}

function anomalyRadar(rows: readonly ObservatoryObservation[], from: Date, to: Date) {
  const baselineFrom = priorComparableRange(from, to).from;
  const currentRows = rows.filter((row) => inRange(row, from, to));
  const baselineRows = rows.filter((row) => inRange(row, baselineFrom, from));
  const currentDays = Math.max(1, dateOrdinal(madridDayKey(to)) - dateOrdinal(madridDayKey(from)));
  const baselineDays = Math.max(1, dateOrdinal(madridDayKey(from)) - dateOrdinal(madridDayKey(baselineFrom)));
  const items = anomalyGroups([...currentRows, ...baselineRows]).flatMap((group) => {
    const current = currentRows.filter(group.predicate);
    const baseline = baselineRows.filter(group.predicate);
    const daily = Array.from({ length: baselineDays }, (_, offset) => {
      const key = ordinalKey(dateOrdinal(madridDayKey(baselineFrom)) + offset);
      return baseline.filter((row) => madridDayKey(row.assignedAt) === key).length;
    });
    const currentDailyBuckets = Array.from({ length: currentDays }, (_, offset) => {
      const key = ordinalKey(dateOrdinal(madridDayKey(from)) + offset);
      return current.filter((row) => madridDayKey(row.assignedAt) === key).length;
    });
    const baselineObservedBucketCount = daily.filter((value) => value > 0).length;
    const currentObservedBucketCount = currentDailyBuckets.filter((value) => value > 0).length;
    const baselineMedian = median(daily) ?? 0;
    const mad = median(daily.map((value) => Math.abs(value - baselineMedian))) ?? 0;
    const currentDaily = current.length / currentDays;
    const materiality = baselineMedian === 0 ? (currentDaily > 0 ? 1 : 0) : Math.abs(currentDaily - baselineMedian) / baselineMedian;
    const bucketsSufficient = baselineDays >= 14 && currentDays >= 7 && baselineObservedBucketCount >= 4;
    const volumeState: AnomalyState = !bucketsSufficient ? "insufficient_evidence" : Math.abs(currentDaily - baselineMedian) > Math.max(3 * mad, 2) && materiality >= 0.2 ? "anomaly" : "within_expected_range";
    const currentMature = current.filter((row) => matureBy(row, to));
    const baselineMature = baseline.filter((row) => matureBy(row, from));
    const currentSales = currentMature.filter((row) => soldBy(row, to)).length;
    const baselineSales = baselineMature.filter((row) => soldBy(row, from)).length;
    const currentWilson = wilson(currentSales, currentMature.length);
    const baselineWilson = wilson(baselineSales, baselineMature.length);
    const conversionDeltaBps = currentMature.length && baselineMature.length ? Math.abs(Math.round(currentSales / currentMature.length * 10_000) - Math.round(baselineSales / baselineMature.length * 10_000)) : null;
    const conversionSamplesSufficient = currentMature.length >= 10 && baselineMature.length >= 30;
    const conversionState: AnomalyState = !bucketsSufficient || !conversionSamplesSufficient ? "insufficient_evidence" : currentWilson && baselineWilson && conversionDeltaBps !== null && conversionDeltaBps >= 500 && (currentWilson.lowBps > baselineWilson.highBps || currentWilson.highBps < baselineWilson.lowBps) ? "anomaly" : "within_expected_range";
    return [
      { key: `${group.key}:volume`, scope: group.scope, label: group.label, metric: "volume" as const, state: volumeState, value: currentDaily, baseline: baselineMedian, dispersion: mad, sample: current.length, baselineSample: baseline.length, currentBucketCount: currentDays, baselineBucketCount: baselineDays, currentObservedBucketCount, baselineObservedBucketCount, currentFrom: from, currentTo: to, baselineFrom, baselineTo: from, minimum: "14 buckets históricos, 7 actuales y actividad en 4 buckets históricos", materialityBps: Math.round(materiality * 10_000), rule: "Mediana diaria y MAD; alerta con >3 MAD, diferencia absoluta >2/día y materialidad ≥20%." },
      { key: `${group.key}:conversion`, scope: group.scope, label: group.label, metric: "conversion" as const, state: conversionState, value: currentMature.length ? currentSales / currentMature.length : null, baseline: baselineMature.length ? baselineSales / baselineMature.length : null, dispersion: null, sample: currentMature.length, baselineSample: baselineMature.length, currentBucketCount: currentDays, baselineBucketCount: baselineDays, currentObservedBucketCount, baselineObservedBucketCount, currentFrom: from, currentTo: to, baselineFrom, baselineTo: from, minimum: "14 buckets históricos, 7 actuales, 4 buckets históricos con actividad, 10 casos maduros actuales y 30 históricos", materialityBps: conversionDeltaBps, currentWilson, baselineWilson, rule: "Requiere 10 actuales y 30 históricos maduros; después aplica Wilson 95% no solapado y diferencia material mínima de 5 pp. Nunca concluye con baseline insuficiente." },
    ];
  }).sort((left, right) => left.scope.localeCompare(right.scope) || left.label.localeCompare(right.label) || left.metric.localeCompare(right.metric));
  return { status: items.some((row) => row.state !== "insufficient_evidence") ? "available" as const : "insufficient_evidence" as const, items, range: { from, to }, baseline: { from: baselineFrom, to: from }, rule: "Baseline de igual duración, estrictamente anterior y sin buckets abiertos." };
}

function leadMargin(row: ObservatoryObservation, asOf: Date, currency?: string) {
  if (!currency) return null;
  const projection = buildFinancialTruthProjection(row.financialEvents.filter((event) => event.currency === currency && event.occurredAt < asOf));
  return projection.find((item) => item.currency === currency)?.realizedMarginBeforeAdsCents ?? null;
}

function riskMap(rows: readonly ObservatoryObservation[], from: Date, to: Date, asOf: Date, currency?: string) {
  const current = rows.filter((row) => inRange(row, from, to));
  const dimensions = [
    ["source", (row: ObservatoryObservation) => row.source],
    ["campaign", (row: ObservatoryObservation) => row.campaign],
    ["caller", (row: ObservatoryObservation) => row.callerLabel?.trim() || "Sin identificar"],
    ["closer", (row: ObservatoryObservation) => row.closerLabel?.trim() || "Sin identificar"],
    ["profile", (row: ObservatoryObservation) => row.profile],
  ] as const;
  const dimensionRows = dimensions.map(([dimension, read]) => {
    const groups = new Map<string, { sample: number; sales: number; absoluteExposureCents: number; negativeMarginExposureCents: number }>();
    for (const row of current) {
      const key = read(row) ?? "Sin atribución";
      const group = groups.get(key) ?? { sample: 0, sales: 0, absoluteExposureCents: 0, negativeMarginExposureCents: 0 };
      group.sample += 1;
      if (soldBy(row, asOf)) group.sales += 1;
      const margin = leadMargin(row, asOf, currency);
      if (margin !== null) {
        group.absoluteExposureCents += Math.abs(margin);
        if (margin < 0) group.negativeMarginExposureCents += Math.abs(margin);
      }
      groups.set(key, group);
    }
    const ordered = [...groups].map(([key, value]) => ({ key, ...value })).sort((left, right) => right.sample - left.sample || left.key.localeCompare(right.key));
    const sample = current.length;
    const shares = ordered.map((group) => sample ? group.sample / sample : 0);
    const top1Bps = Math.round((shares[0] ?? 0) * 10_000);
    const top3Bps = Math.round(shares.slice(0, 3).reduce((sum, share) => sum + share, 0) * 10_000);
    const hhi = shares.reduce((sum, share) => sum + share ** 2, 0);
    const level = top1Bps >= 6000 || hhi >= 0.35 ? "high" : top1Bps >= 4000 || hhi >= 0.2 ? "medium" : "low";
    return { dimension, sample, groups: ordered, top1Bps, top3Bps, hhi, level, absoluteExposureCents: ordered.reduce((sum, group) => sum + group.absoluteExposureCents, 0), negativeMarginExposureCents: ordered.reduce((sum, group) => sum + group.negativeMarginExposureCents, 0), rule: "Alto: top1 ≥60% o HHI ≥0,35; medio: top1 ≥40% o HHI ≥0,20; bajo en otro caso." };
  });
  const withoutAttribution = current.filter((row) => !row.source || !row.campaign).length;
  const salesWithoutLedger = currency ? current.filter((row) => soldBy(row, asOf) && !row.financialEvents.some((event) => event.currency === currency && event.occurredAt < asOf)).length : null;
  const ledgerStatus = currency ? "available" as const : "currency_required" as const;
  return { status: current.length ? "available" as const : "insufficient_evidence" as const, dimensions: dimensionRows, coverage: { sample: current.length, withoutAttribution, salesWithoutLedger, ledgerStatus }, currency: currency ?? null, range: { from, to }, rule: "Concentración descriptiva por exposición; los márgenes negativos usan exposición absoluta." };
}

export function buildCommercialObservatory(input: BuildInput) {
  const baselineFrom = priorComparableRange(input.from, input.to).from;
  const comparedInput = input.observations.filter((row) => row.assignedAt < input.asOf && (inRange(row, baselineFrom, input.from) || inRange(row, input.from, input.to)));
  const { rows, duplicates } = dedupeObservations(comparedInput, input.asOf);
  const currencies = [...new Set(rows.flatMap((row) => {
    const cutoff = inRange(row, input.from, input.to) ? input.to : inRange(row, baselineFrom, input.from) ? input.from : null;
    return cutoff ? row.financialEvents.filter((event) => event.occurredAt < cutoff).map((event) => event.currency) : [];
  }))].sort();
  const resolvedCurrency = input.currency ?? (currencies.length === 1 ? currencies[0] : undefined);
  return {
    policyVersion: COMMERCIAL_OBSERVATORY_POLICY_VERSION,
    generatedAt: input.asOf,
    timeZone: COMMERCIAL_OBSERVATORY_TIME_ZONE,
    range: { from: input.from, to: input.to },
    coverage: { observations: rows.length, duplicateObservationsExcluded: duplicates },
    currencies,
    resolvedCurrency: resolvedCurrency ?? null,
    seasonality: seasonality(rows, input.from, input.to),
    anomalies: anomalyRadar(rows, input.from, input.to),
    bridge: {
      status: rows.length ? "available" as const : "insufficient_evidence" as const,
      commercial: commercialBridge(rows, input.from, input.to),
      economic: economicBridge(rows, input.from, input.to, currencies, resolvedCurrency),
      note: "Las barras son una contribución aritmética que suma exactamente el delta. No implica causalidad.",
    },
    risk: riskMap(rows, input.from, input.to, input.asOf, resolvedCurrency),
  };
}
