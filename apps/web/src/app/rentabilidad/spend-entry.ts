export type SpendEntryMode = "daily" | "period";

export function resolveSpendDates(input: {
  mode: SpendEntryMode;
  date: string;
  from: string;
  to: string;
}) {
  return input.mode === "daily"
    ? { periodStart: input.date, periodEnd: input.date }
    : { periodStart: input.from, periodEnd: input.to };
}
