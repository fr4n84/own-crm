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
  it("validates urgent and warning windows independently for every alert type", () => {
    const result = alertPreferencesInput.safeParse({
      relevanceMode: "time", urgentThresholdHours: 2, warningThresholdHours: 6,
      ...conditionSeverities,
      noContactUrgentThresholdHours: 3, noContactWarningThresholdHours: 2,
      followUpUrgentThresholdHours: 1, followUpWarningThresholdHours: 4,
      futureCallUrgentThresholdHours: 1, futureCallWarningThresholdHours: 4,
      appointmentUrgentThresholdHours: 1, appointmentWarningThresholdHours: 4,
      rescheduledUrgentThresholdHours: 1, rescheduledWarningThresholdHours: 4,
    });
    expect(result.success).toBe(false);
  });
});
