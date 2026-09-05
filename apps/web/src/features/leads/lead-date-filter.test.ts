import { describe, expect, it } from "vitest";
import { matchesLeadDateRange } from "./lead-date-filter";

const lead = { createdAt: "2026-01-14T23:00:00.000Z", updatedAt: "2026-01-15T22:59:59.999Z" };

describe("personal lead date filtering in Madrid", () => {
  it("includes both exact day boundaries from the serialized tRPC shape", () => {
    expect(matchesLeadDateRange(lead, "createdAt", { from: "2026-01-15", to: "2026-01-15" })).toBe(true);
    expect(matchesLeadDateRange(lead, "updatedAt", { from: "2026-01-15", to: "2026-01-15" })).toBe(true);
  });
  it("keeps creation and update filters independent", () => {
    const changed = { createdAt: "2026-01-13T12:00:00.000Z", updatedAt: "2026-01-15T12:00:00.000Z" };
    expect(matchesLeadDateRange(changed, "createdAt", { from: "2026-01-15", to: "2026-01-15" })).toBe(false);
    expect(matchesLeadDateRange(changed, "updatedAt", { from: "2026-01-15", to: "2026-01-15" })).toBe(true);
  });
});
