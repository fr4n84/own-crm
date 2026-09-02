import { describe, expect, it } from "vitest";

import { personalStatisticsInput } from "./leads";

describe("personal statistics input", () => {
  it("accepts a person filter together with a date interval", () => {
    expect(
      personalStatisticsInput.safeParse({
        callerId: "caller-1",
        from: "2026-08-01",
        to: "2026-08-31",
      }).success,
    ).toBe(true);
  });

  it("rejects simultaneous caller and closer filters", () => {
    expect(
      personalStatisticsInput.safeParse({
        callerId: "caller-1",
        closerId: "closer-1",
      }).success,
    ).toBe(false);
  });

  it("rejects a reversed date interval", () => {
    expect(
      personalStatisticsInput.safeParse({
        from: "2026-08-31",
        to: "2026-08-01",
      }).success,
    ).toBe(false);
  });
});
