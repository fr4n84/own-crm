const DAY_MS = 86_400_000;
const madridParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function ordinal(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year!, month! - 1, date!);
}

function madridMidnight(day: string) {
  const target = ordinal(day);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(madridParts.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += target - represented;
  }
  return new Date(guess);
}

export function matchesLeadDateRange(
  lead: { createdAt: Date | string; updatedAt: Date | string },
  field: "createdAt" | "updatedAt",
  range?: { from?: string; to?: string },
) {
  const value = new Date(lead[field]);
  if (Number.isNaN(value.getTime())) return false;
  const from = range?.from ? madridMidnight(range.from) : undefined;
  const to = range?.to ? new Date(madridMidnight(new Date(ordinal(range.to) + DAY_MS).toISOString().slice(0, 10)).getTime() - 1) : undefined;
  return (!from || value >= from) && (!to || value <= to);
}
