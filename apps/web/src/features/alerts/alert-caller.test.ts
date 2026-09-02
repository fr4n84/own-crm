import { describe, expect, it } from "vitest";

import { filterAlertsByCaller, getAlertCallers } from "./alert-caller";

const alerts = [
  { id: "a", lead: { caller: { id: "caller-1", name: "Ana" } } },
  { id: "b", lead: { caller: { id: "caller-1", name: "Ana" } } },
  { id: "c", lead: { caller: { id: "caller-2", name: "Bruno" } } },
  { id: "d", lead: { caller: null } },
];

describe("alert caller helpers", () => {
  it("returns unique callers in display order", () => {
    expect(getAlertCallers(alerts)).toEqual([
      { id: "caller-1", name: "Ana" },
      { id: "caller-2", name: "Bruno" },
    ]);
  });

  it("shows all alerts for all and only the selected caller otherwise", () => {
    expect(filterAlertsByCaller(alerts, "all")).toEqual(alerts);
    expect(
      filterAlertsByCaller(alerts, "caller-1").map((alert) => alert.id),
    ).toEqual(["a", "b"]);
    expect(
      filterAlertsByCaller(alerts, "caller-2").map((alert) => alert.id),
    ).toEqual(["c"]);
  });
});
