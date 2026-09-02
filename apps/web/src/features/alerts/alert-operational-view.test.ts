import { describe, expect, it } from "vitest";

import {
  filterLeadRiskQueue,
  getOperationalAlertCounters,
  mergeAlertPeople,
} from "./alert-operational-view";

const riskItems = [
  {
    priority: "high" as const,
    lead: {
      id: "lead-1",
      caller: { id: "caller-1", name: "Ana" },
      closer: { id: "closer-1", name: "Carlos" },
    },
  },
  {
    priority: "low" as const,
    lead: {
      id: "lead-2",
      caller: { id: "caller-2", name: "Bea" },
      closer: null,
    },
  },
];

describe("shared alert operations", () => {
  it("applies relevance, caller, type, and closer filters to the risk queue", () => {
    expect(
      filterLeadRiskQueue(riskItems, {
        severity: "urgent",
        caller: "caller-1",
        type: "no_contact",
        closer: "closer-1",
      }),
    ).toEqual([riskItems[0]]);

    expect(
      filterLeadRiskQueue(riskItems, {
        severity: "all",
        caller: "all",
        type: "future_call",
        closer: "all",
      }),
    ).toEqual([]);
  });

  it("builds operational counters from the currently filtered data", () => {
    expect(
      getOperationalAlertCounters(
        [
          { kind: "future_call", severity: "warning", lead: { id: "lead-3" } },
          { kind: "follow_up", severity: "urgent", lead: { id: "lead-1" } },
        ],
        riskItems,
      ),
    ).toEqual({
      activeAlerts: 2,
      leadsAtRisk: 2,
      highPriority: 1,
      futureCalls: 1,
    });
  });

  it("offers callers and closers found in either alert source without duplicates", () => {
    expect(
      mergeAlertPeople(
        [{ id: "caller-1", name: "Ana" }],
        riskItems.map(({ lead }) => lead.caller),
      ),
    ).toEqual([
      { id: "caller-1", name: "Ana" },
      { id: "caller-2", name: "Bea" },
    ]);
  });
});
