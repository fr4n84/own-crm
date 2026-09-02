import { describe, expect, it } from "vitest";
import type { Context } from "../context";
import { commercialPlanningInput, commercialPlanningRouter } from "./commercial-planning";

describe("commercial planning router", () => {
  it("bounds money, rates, percentages, capacity and exact horizons", () => {
    expect(() => commercialPlanningInput.parse({ currency: "EUR", horizons: [30, 60, 90], scenario: { saleRateBps: 10_001 } })).toThrow();
    expect(() => commercialPlanningInput.parse({ currency: "EUR", horizons: [30, 90], scenario: {} })).toThrow();
    expect(() => commercialPlanningInput.parse({ currency: "eur", horizons: [30, 60, 90], scenario: {} })).toThrow();
    expect(() => commercialPlanningInput.parse({ currency: "EUR", horizons: [30, 60, 90], scenario: { capacity: { availableCallers: -1 } } })).toThrow();
    expect(commercialPlanningInput.parse({ currency: "EUR", horizons: [30, 60, 90], scenario: { commission: { collectionsPercentBps: 1_000, callerShareBps: 4_000 } } })).toBeDefined();
    expect(() => commercialPlanningInput.parse({ currency: "EUR", horizons: [30, 60, 90], scenario: { leadVolumePerDay: 100_000, saleRateBps: 10_000, collectionPerSaleCents: 2_000_000_000, seasonalityEnabled: true, seasonalityFactorBps: 30_000 } })).toThrow(/safe integer/i);
  });

  it("is read-only and admin-only", async () => {
    expect(Object.keys(commercialPlanningRouter._def.procedures)).toEqual(["overview"]);
    const caller = commercialPlanningRouter.createCaller({ session: { user: { id: "caller", roleId: "caller", name: "Caller", email: "caller@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } }, role: { id: "caller", name: "Caller", permissions: ["leads:read"] }, permissions: ["leads:read"] } as Context);
    await expect(caller.overview({ currency: "EUR", horizons: [30, 60, 90], scenario: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
