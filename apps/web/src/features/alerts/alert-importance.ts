export type AlertSeverityFilter = "all" | "urgent" | "warning" | "info";
export type NormalizedAlertSeverity = Exclude<AlertSeverityFilter, "all">;

export function normalizeAlertSeverity(
  severity: string,
): NormalizedAlertSeverity | null {
  if (severity === "urgent" || severity === "high") return "urgent";
  if (severity === "warning") return "warning";
  if (severity === "info") return "info";
  return null;
}

export function filterAlertsBySeverity<T extends { severity: string }>(
  alerts: readonly T[],
  filter: AlertSeverityFilter,
): T[] {
  if (filter === "all") return [...alerts];
  return alerts.filter(
    (alert) => normalizeAlertSeverity(alert.severity) === filter,
  );
}
