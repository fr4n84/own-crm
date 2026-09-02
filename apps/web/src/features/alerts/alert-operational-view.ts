import type { AlertCloserFilter } from "./alert-closer";
import type { AlertCallerFilter } from "./alert-caller";
import type { AlertSeverityFilter } from "./alert-importance";
import type { AlertTypeFilter } from "./alert-type";

type Person = { id: string; name: string };

type LeadRiskItem = {
  priority: "critical" | "high" | "medium" | "low";
  lead: {
    id: string;
    caller: Person | null;
    closer: Person | null;
  };
};

type SharedAlertFilters = {
  severity: AlertSeverityFilter;
  caller: AlertCallerFilter;
  type: AlertTypeFilter;
  closer: AlertCloserFilter;
};

type OperationalAlert = {
  kind: string;
  severity: string;
  lead?: { id: string } | null;
};

export function getRiskSeverity(
  priority: LeadRiskItem["priority"],
): Exclude<AlertSeverityFilter, "all"> {
  if (priority === "critical" || priority === "high") return "urgent";
  if (priority === "medium") return "warning";
  return "info";
}

export function filterLeadRiskQueue<T extends LeadRiskItem>(
  items: readonly T[],
  filters: SharedAlertFilters,
): T[] {
  if (filters.type !== "all" && filters.type !== "no_contact") return [];

  return items.filter(
    (item) =>
      (filters.severity === "all" ||
        getRiskSeverity(item.priority) === filters.severity) &&
      (filters.caller === "all" || item.lead.caller?.id === filters.caller) &&
      (filters.closer === "all" || item.lead.closer?.id === filters.closer),
  );
}

export function getOperationalAlertCounters(
  alerts: readonly OperationalAlert[],
  riskItems: readonly LeadRiskItem[],
) {
  const highPriorityLeadIds = new Set(
    riskItems
      .filter(({ priority }) => getRiskSeverity(priority) === "urgent")
      .map(({ lead }) => lead.id),
  );
  let highPriorityWithoutLead = 0;
  for (const alert of alerts) {
    if (alert.severity !== "urgent") continue;
    if (alert.lead) highPriorityLeadIds.add(alert.lead.id);
    else highPriorityWithoutLead += 1;
  }

  return {
    activeAlerts: alerts.length,
    leadsAtRisk: riskItems.length,
    highPriority: highPriorityLeadIds.size + highPriorityWithoutLead,
    futureCalls: alerts.filter(({ kind }) => kind === "future_call").length,
  };
}

export function mergeAlertPeople(
  first: readonly Person[],
  second: readonly (Person | null)[],
): Person[] {
  const people = new Map(first.map((person) => [person.id, person]));
  for (const person of second) {
    if (person) people.set(person.id, person);
  }
  return [...people.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
