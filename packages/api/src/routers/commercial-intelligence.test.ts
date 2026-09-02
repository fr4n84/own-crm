import { describe, expect, it } from "vitest";
import { commercialIntelligenceInput, commercialIntelligenceObjectionRange } from "./commercial-intelligence";
describe("commercial intelligence input", () => {
 it("rejects an inverted time window", () => expect(() => commercialIntelligenceInput.parse({ from: "2026-08-23", to: "2026-08-01" })).toThrow());
 it("rejects impossible calendar dates rather than accepting a regex-shaped date", () => expect(() => commercialIntelligenceInput.parse({ from: "2026-02-30", to: "2026-08-23" })).toThrow());
 it("accepts an explicit non-negative reference sale value", () => expect(commercialIntelligenceInput.parse({ from: "2026-08-01", to: "2026-08-23", referenceSaleValue: 1000 }).referenceSaleValue).toBe(1000));
 it("uses a Madrid [from, to) range across the spring DST boundary", () => {
  const range = commercialIntelligenceObjectionRange("2026-03-29", "2026-03-29");
  expect(range.from.toISOString()).toBe("2026-03-28T23:00:00.000Z");
  expect(range.to.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  expect(range.to.getTime() - range.from.getTime()).toBe(23 * 60 * 60 * 1000);
 });
 it("uses a Madrid [from, to) range across the autumn DST boundary", () => {
  const range = commercialIntelligenceObjectionRange("2026-10-25", "2026-10-25");
  expect(range.from.toISOString()).toBe("2026-10-24T22:00:00.000Z");
  expect(range.to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  expect(range.to.getTime() - range.from.getTime()).toBe(25 * 60 * 60 * 1000);
 });
});
