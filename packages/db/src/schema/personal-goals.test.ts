import { describe, expect, it } from "vitest";

import { PERSONAL_GOAL_METRIC, personalGoals } from "./personal-goals";

describe("personalGoals schema", () => {
  it("supports every positive personal goal metric", () => {
    expect(Object.values(PERSONAL_GOAL_METRIC)).toEqual([
      "contacted",
      "shows",
      "appointments",
      "appointment_rate",
      "assigned",
      "future_calls",
    ]);
  });

  it("stores owner, target and custom date interval", () => {
    expect(personalGoals.userId).toBeDefined();
    expect(personalGoals.targetValue).toBeDefined();
    expect(personalGoals.startDate).toBeDefined();
    expect(personalGoals.endDate).toBeDefined();
  });
});
