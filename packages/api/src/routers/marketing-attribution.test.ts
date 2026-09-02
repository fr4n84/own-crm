import { describe, expect, it } from "vitest";

import {
  analyzeMarketingTranscriptInput,
  saveMarketingMappingInput,
} from "./marketing-attribution";

const validMapping = {
  leadSource: null,
  utmContent: "video-01",
  campaignSource: "Meta",
  campaignName: "Campaña captación",
  creativeName: "Vídeo libertad",
  creativeFormat: "video" as const,
};

describe("marketing attribution router contracts", () => {
  it("accepts mappings for imported leads without a source", () => {
    expect(saveMarketingMappingInput.parse(validMapping)).toMatchObject({
      leadSource: null,
      utmContent: "video-01",
    });
  });

  it("rejects inverted validity windows", () => {
    expect(() =>
      saveMarketingMappingInput.parse({
        ...validMapping,
        validFrom: "2026-09-01",
        validTo: "2026-08-01",
      }),
    ).toThrow();
  });

  it("requires a meaningful transcript before invoking AI", () => {
    expect(() => analyzeMarketingTranscriptInput.parse({ transcript: "corto" })).toThrow();
  });
});
