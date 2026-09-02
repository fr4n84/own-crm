import { describe, expect, it } from "vitest";

import { selectFeedbackCaller } from "./feedback-statistics-filters";

describe("feedback statistics filters", () => {
  it("keeps the selected caller name instead of exposing its id", () => {
    expect(
      selectFeedbackCaller(
        [{ id: "caller-8f2", name: "María López" }],
        "caller-8f2",
      ),
    ).toEqual({ id: "caller-8f2", name: "María López" });
  });
});
