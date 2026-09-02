import { describe, expect, it } from "vitest";

import { filterFeedbackDetails } from "./feedback-statistics-drilldown";

const feedbacks = [
  {
    leadId: "lead-1",
    source: "Meta Ads",
    campaign: "VSL Agosto",
    profile: "latino_extranjero",
    angles: ["financial_stability"],
    outcome: "Agenda",
  },
  {
    leadId: "lead-2",
    source: null,
    campaign: null,
    profile: null,
    angles: [],
    outcome: null,
  },
];

describe("feedback statistics drill-down", () => {
  it("selects the feedbacks represented by a chart segment", () => {
    expect(filterFeedbackDetails(feedbacks, { kind: "source", value: "Meta Ads" })).toHaveLength(1);
    expect(filterFeedbackDetails(feedbacks, { kind: "profile", value: "latino_extranjero" })).toHaveLength(1);
    expect(filterFeedbackDetails(feedbacks, { kind: "angle", value: "financial_stability" })).toHaveLength(1);
    expect(filterFeedbackDetails(feedbacks, { kind: "reaction", value: "appointment" })).toHaveLength(1);
  });

  it("selects incomplete feedbacks for data-quality drill-down", () => {
    expect(filterFeedbackDetails(feedbacks, { kind: "missing", value: "source" }).map(({ leadId }) => leadId)).toEqual(["lead-2"]);
    expect(filterFeedbackDetails(feedbacks, { kind: "missing", value: "outcome" }).map(({ leadId }) => leadId)).toEqual(["lead-2"]);
  });
});
