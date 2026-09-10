import { describe, expect, it } from "vitest";

import { assertMergeableRelationships, mergeQuestions } from "./domain";

describe("lead duplicate merge domain", () => {
  it("blocks ambiguous one-to-one records and experiment collisions", () => {
    expect(() =>
      assertMergeableRelationships({
        sourceHasSale: true,
        targetHasSale: true,
        sourceHasAttribution: false,
        targetHasAttribution: false,
        sourceExperimentIds: [],
        targetExperimentIds: [],
      }),
    ).toThrow(/venta/i);
    expect(() =>
      assertMergeableRelationships({
        sourceHasSale: false,
        targetHasSale: false,
        sourceHasAttribution: false,
        targetHasAttribution: false,
        sourceExperimentIds: ["experiment-1"],
        targetExperimentIds: ["experiment-1"],
      }),
    ).toThrow(/experiment/i);
  });

  it("combines feedback questions without dropping either lead or duplicating identical entries", () => {
    const shared = { questionKey: "fit", question: "Encaje", answer: "Sí", authorRole: "caller" as const, authorId: "caller-1" };
    expect(
      mergeQuestions([shared], [shared, { ...shared, answer: "No", authorId: "caller-2" }]),
    ).toHaveLength(2);
  });
});
