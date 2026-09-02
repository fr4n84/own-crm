export type AlertCallerFilter = "all" | string;
export type AlertCaller = { id: string; name: string };

type AlertWithCaller = {
  lead: { caller: AlertCaller | null } | null;
};

export function getAlertCallers<T extends AlertWithCaller>(
  alerts: readonly T[],
): AlertCaller[] {
  const callers = new Map<string, AlertCaller>();

  for (const alert of alerts) {
    const caller = alert.lead?.caller;
    if (caller && !callers.has(caller.id)) {
      callers.set(caller.id, caller);
    }
  }

  return [...callers.values()];
}

export function filterAlertsByCaller<T extends AlertWithCaller>(
  alerts: readonly T[],
  callerFilter: AlertCallerFilter,
): T[] {
  if (callerFilter === "all") {
    return [...alerts];
  }

  return alerts.filter((alert) => alert.lead?.caller?.id === callerFilter);
}
