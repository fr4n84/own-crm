import { describe, expect, it } from "vitest";

import { alertPreferencesInput } from "./alerts";

const conditionSeverities = {
  noContactSeverity: "urgent",
  followUpSeverity: "info",
  futureCallSeverity: "warning",
  appointmentSeverity: "urgent",
  rescheduledSeverity: "warning",
};

describe("alert preferences input", () => {
  it("accepts valid condition and time configurations", () => {
    expect(
      alertPreferencesInput.safeParse({
        relevanceMode: "condition",
        urgentThresholdHours: 2,
        warningThresholdHours: 6,
        ...conditionSeverities,
      }).success,
    ).toBe(true);
    expect(
      alertPreferencesInput.safeParse({
        relevanceMode: "time",
        urgentThresholdHours: 1,
        warningThresholdHours: 8,
        ...conditionSeverities,
      }).success,
    ).toBe(true);
  });

  it("requires the warning threshold to be greater than urgent", () => {
    expect(
      alertPreferencesInput.safeParse({
        relevanceMode: "time",
        urgentThresholdHours: 6,
        warningThresholdHours: 2,
        ...conditionSeverities,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid condition relevance", () => {
    expect(
      alertPreferencesInput.safeParse({
        relevanceMode: "condition",
        urgentThresholdHours: 2,
        warningThresholdHours: 6,
        ...conditionSeverities,
        appointmentSeverity: "critical",
      }).success,
    ).toBe(false);
  });
});
