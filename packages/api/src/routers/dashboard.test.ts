import { describe, expect, it } from "vitest";

import { dashboardSummaryInput } from "./dashboard";

describe("dashboard summary input", () => {
  it("accepts inclusive calendar-day ranges and rejects malformed or reversed ones", () => {
    expect(
      dashboardSummaryInput.parse({ from: "2026-07-01", to: "2026-07-31" }),
    ).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(() => dashboardSummaryInput.parse({ from: "2026-07-31", to: "2026-07-01" })).toThrow();
    expect(() => dashboardSummaryInput.parse({ from: "31-07-2026", to: "2026-07-31" })).toThrow();
  });
});
