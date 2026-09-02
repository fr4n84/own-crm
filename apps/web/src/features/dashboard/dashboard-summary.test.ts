import { describe, expect, it } from "vitest";

import {
  buildDashboardComparison,
  createDefaultDashboardRanges,
  dashboardSummaryQueryInputs,
} from "./dashboard-summary";

describe("Dashboard summary ranges", () => {
  it("creates adjacent 30-day inclusive ranges using Madrid's last closed day", () => {
    expect(createDefaultDashboardRanges(new Date("2026-08-27T10:00:00.000Z"))).toEqual({
      primary: { from: "2026-07-28", to: "2026-08-26" },
      comparison: { from: "2026-06-28", to: "2026-07-27" },
    });
  });

  it("passes both user-visible inclusive ranges unchanged to the typed API", () => {
    const ranges = {
      primary: { from: "2026-03-28", to: "2026-03-29" },
      comparison: { from: "2026-03-26", to: "2026-03-27" },
    };
    expect(dashboardSummaryQueryInputs(ranges)).toEqual(ranges);
  });

  it("calculates absolute and percentage deltas without emitting infinity", () => {
    expect(buildDashboardComparison(100, 80)).toEqual({
      absolute: 20,
      percent: 25,
      status: "comparable",
    });
    expect(buildDashboardComparison(50, 0)).toEqual({
      absolute: 50,
      percent: null,
      status: "zero_denominator",
    });
    expect(buildDashboardComparison(0, 0).percent).toBeNull();
  });
});
