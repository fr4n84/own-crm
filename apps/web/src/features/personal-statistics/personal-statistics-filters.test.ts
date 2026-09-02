import { describe, expect, it } from "vitest";

import {
  selectCallerFilter,
  selectCloserFilter,
  toggleConditionFilter,
} from "./personal-statistics-filters";

describe("personal statistics person filters", () => {
  it("clears the closer when a caller is selected", () => {
    expect(
      selectCallerFilter(
        { callerId: "all", closerId: "closer-1" },
        "caller-1",
      ),
    ).toEqual({ callerId: "caller-1", closerId: "all" });
  });

  it("clears the caller when a closer is selected", () => {
    expect(
      selectCloserFilter(
        { callerId: "caller-1", closerId: "all" },
        "closer-1",
      ),
    ).toEqual({ callerId: "all", closerId: "closer-1" });
  });

  it("allows several lead conditions but never an empty selection", () => {
    expect(toggleConditionFilter(["assigned"], "appointment")).toEqual([
      "assigned",
      "appointment",
    ]);
    expect(
      toggleConditionFilter(["assigned", "appointment"], "assigned"),
    ).toEqual(["appointment"]);
    expect(toggleConditionFilter(["appointment"], "appointment")).toEqual([
      "appointment",
    ]);
  });
});
