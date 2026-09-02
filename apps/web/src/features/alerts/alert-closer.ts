export type AlertCloserFilter = "all" | string;
export type AlertCloser = { id: string; name: string };

type AlertWithCloser = {
  lead: { closer: AlertCloser | null } | null;
};

export function getAlertClosers<T extends AlertWithCloser>(
  alerts: readonly T[],
): AlertCloser[] {
  const closers = new Map<string, AlertCloser>();

  for (const alert of alerts) {
    const closer = alert.lead?.closer;
    if (closer && !closers.has(closer.id)) {
      closers.set(closer.id, closer);
    }
  }

  return [...closers.values()];
}

export function filterAlertsByCloser<T extends AlertWithCloser>(
  alerts: readonly T[],
  closerFilter: AlertCloserFilter,
): T[] {
  if (closerFilter === "all") {
    return [...alerts];
  }

  return alerts.filter((alert) => alert.lead?.closer?.id === closerFilter);
}
