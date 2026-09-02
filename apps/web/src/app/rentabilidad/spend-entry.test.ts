import { describe, expect, it } from "vitest";

import { resolveSpendDates } from "./spend-entry";

describe("spend entry dates", () => {
  it("stores daily spend as a single closed day", () => {
    expect(resolveSpendDates({ mode: "daily", date: "2026-09-01", from: "", to: "" })).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
    });
  });

  it("preserves explicit periods", () => {
    expect(resolveSpendDates({ mode: "period", date: "", from: "2026-09-01", to: "2026-09-07" })).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-07",
    });
  });
});
