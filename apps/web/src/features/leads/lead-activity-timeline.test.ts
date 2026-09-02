import { describe, expect, it } from "vitest";

import { attributionChangeSummary } from "./lead-activity-timeline";

describe("attributionChangeSummary", () => {
  it("returns only changed attribution values", () => {
    expect(attributionChangeSummary({ before: { source: "Meta", ad: null }, after: { source: "Meta", ad: "Vídeo" } })).toEqual([
      { key: "ad", label: "Anuncio", previous: null, current: "Vídeo" },
    ]);
  });
});
