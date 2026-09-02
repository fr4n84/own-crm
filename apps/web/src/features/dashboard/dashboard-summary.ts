export type DashboardDateRange = {
  from: string;
  to: string;
};

export type DashboardRanges = {
  primary: DashboardDateRange;
  comparison: DashboardDateRange;
};

const madridDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function madridDayKey(date: Date) {
  const parts = Object.fromEntries(
    madridDayFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

export function createDefaultDashboardRanges(now = new Date()): DashboardRanges {
  const primaryTo = addCalendarDays(madridDayKey(now), -1);
  const primaryFrom = addCalendarDays(primaryTo, -29);
  const comparisonTo = addCalendarDays(primaryFrom, -1);
  return {
    primary: { from: primaryFrom, to: primaryTo },
    comparison: { from: addCalendarDays(comparisonTo, -29), to: comparisonTo },
  };
}

export function dashboardSummaryQueryInputs(ranges: DashboardRanges) {
  return {
    primary: { ...ranges.primary },
    comparison: { ...ranges.comparison },
  };
}

export function isValidDashboardRange(range: DashboardDateRange, lastClosedDay: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(range.from)
    && /^\d{4}-\d{2}-\d{2}$/.test(range.to)
    && range.from <= range.to
    && range.to <= lastClosedDay;
}

export function buildDashboardComparison(primary: number, comparison: number) {
  const absolute = primary - comparison;
  if (comparison === 0) {
    return { absolute, percent: null, status: "zero_denominator" as const };
  }
  return {
    absolute,
    percent: Math.round((absolute / comparison) * 1_000) / 10,
    status: "comparable" as const,
  };
}
