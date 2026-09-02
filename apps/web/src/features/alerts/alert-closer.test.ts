import { describe, expect, it } from "vitest";

import { filterAlertsByCloser, getAlertClosers } from "./alert-closer";

const alerts = [
  { id: "a", lead: { closer: { id: "closer-1", name: "Clara" } } },
  { id: "b", lead: { closer: { id: "closer-1", name: "Clara" } } },
  {
    id: "c",
    lead: {
      closer: { id: "closer-2", name: "Diego" },
      historicalCloserId: "closer-1",
    },
  },
  { id: "d", lead: { closer: null } },
];

describe("alert closer helpers", () => {
  it("returns unique closers from the complete alert collection", () => {
    expect(getAlertClosers(alerts)).toEqual([
      { id: "closer-1", name: "Clara" },
      { id: "closer-2", name: "Diego" },
    ]);
  });

  it("filters only by closer without requiring another filter", () => {
    expect(filterAlertsByCloser(alerts, "all")).toEqual(alerts);
    expect(
      filterAlertsByCloser(alerts, "closer-1").map((alert) => alert.id),
    ).toEqual(["a", "b"]);
    expect(
      filterAlertsByCloser(alerts, "closer-2").map((alert) => alert.id),
    ).toEqual(["c"]);
  });
});
