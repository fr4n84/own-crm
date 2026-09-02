import { describe, expect, it } from "vitest";

import {
  filterAlertsBySeverity,
  normalizeAlertSeverity,
} from "./alert-importance";

const alerts = [
  { id: "urgent", severity: "urgent" },
  { id: "legacy-high", severity: "high" },
  { id: "warning", severity: "warning" },
  { id: "info", severity: "info" },
];

describe("normalizeAlertSeverity", () => {
  it("maps urgent and legacy high to urgent", () => {
    expect(normalizeAlertSeverity("urgent")).toBe("urgent");
    expect(normalizeAlertSeverity("high")).toBe("urgent");
  });

  it("preserves warning and info", () => {
    expect(normalizeAlertSeverity("warning")).toBe("warning");
    expect(normalizeAlertSeverity("info")).toBe("info");
  });

  it("returns null for unknown severities", () => {
    expect(normalizeAlertSeverity("critical")).toBeNull();
  });
});

it("filters all loaded alerts by the selected severity", () => {
  expect(filterAlertsBySeverity(alerts, "all")).toEqual(alerts);
  expect(filterAlertsBySeverity(alerts, "urgent").map((alert) => alert.id)).toEqual([
    "urgent",
    "legacy-high",
  ]);
  expect(filterAlertsBySeverity(alerts, "warning").map((alert) => alert.id)).toEqual([
    "warning",
  ]);
  expect(filterAlertsBySeverity(alerts, "info").map((alert) => alert.id)).toEqual([
    "info",
  ]);
});
