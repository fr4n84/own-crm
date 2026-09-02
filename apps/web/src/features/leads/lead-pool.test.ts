import { describe, expect, it } from "vitest";

import {
  getLeadPoolProgress,
  isAssignableLeadPool,
  splitDiscardedLeads,
} from "./lead-pool";

describe("lead pool presentation", () => {
  it("shows the current recovery impact", () => {
    expect(getLeadPoolProgress(1)).toBe("Impacto 1 de 3");
    expect(getLeadPoolProgress(3)).toBe("Impacto 3 de 3");
  });

  it("keeps discarded leads read-only", () => {
    expect(isAssignableLeadPool("new")).toBe(true);
    expect(isAssignableLeadPool("recovered")).toBe(true);
    expect(isAssignableLeadPool("discarded")).toBe(false);
  });

  it("separates exhausted impacts from wrong phone numbers", () => {
    const exhausted = {
      id: "three-impacts",
      state: "asignado",
      noContactImpactCount: 3,
    };
    const wrongNumber = {
      id: "wrong-number",
      state: "número erróneo",
      noContactImpactCount: 0,
    };

    expect(splitDiscardedLeads([exhausted, wrongNumber])).toEqual({
      threeImpacts: [exhausted],
      wrongNumbers: [wrongNumber],
    });
  });
});
