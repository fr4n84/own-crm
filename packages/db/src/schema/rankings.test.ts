import { describe, expect, it } from "vitest";

import { rankingEvents, rankingPointSettings, rankingMonthlyResults } from "./rankings";

describe("rankings schema", () => {
  it("provides default league weights", () => {
    expect(rankingPointSettings.callerLeadTakenPoints.default).toBe(1);
    expect(rankingPointSettings.closerSalePoints.default).toBe(10);
  });

  it("stores immutable metric events and monthly snapshots", () => {
    expect(rankingEvents.metric).toBeDefined();
    expect(rankingEvents.dedupeKey).toBeDefined();
    expect(rankingMonthlyResults.position).toBeDefined();
  });
});
