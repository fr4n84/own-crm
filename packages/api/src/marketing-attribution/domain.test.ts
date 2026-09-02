import { describe, expect, it } from "vitest";

import {
  attributionRuleMatchesLead,
  normalizeMarketingKey,
  summarizeAttributionCoverage,
} from "./domain";

describe("marketing attribution domain", () => {
  it("normalizes source and utm values without changing their meaning", () => {
    expect(normalizeMarketingKey("  META  ADS ")).toBe("meta ads");
    expect(normalizeMarketingKey("CrÉAtivo-01")).toBe("creativo-01");
  });

  it("matches a rule by source, utm content and validity window", () => {
    const rule = {
      sourceKey: "meta",
      utmContentKey: "video-01",
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-08-31T23:59:59.999Z"),
    };

    expect(
      attributionRuleMatchesLead(rule, {
        source: " Meta ",
        utmContent: "VIDEO-01",
        createdAt: new Date("2026-08-15T10:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      attributionRuleMatchesLead(rule, {
        source: "meta",
        utmContent: "video-01",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("reports coverage only over leads that contain utm content", () => {
    expect(
      summarizeAttributionCoverage({
        totalLeads: 20,
        leadsWithUtm: 10,
        attributedLeads: 7,
      }),
    ).toEqual({
      totalLeads: 20,
      leadsWithUtm: 10,
      attributedLeads: 7,
      unmappedLeads: 3,
      coveragePercent: 70,
    });
  });
});
