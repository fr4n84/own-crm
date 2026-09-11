import { describe, expect, it, vi } from "vitest";

import { createMetaAdLibraryClient } from "./meta-client";

describe("Meta Ad Library client", () => {
  it("requests only allowlisted public fields without putting the access token in the URL", async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      data: [{
        id: "library-1",
        page_id: "page-1",
        page_name: "Example competitor",
        ad_delivery_start_time: "2026-09-01",
        ad_delivery_stop_time: null,
        publisher_platforms: ["facebook", "instagram"],
        ad_creative_bodies: ["Public creative"],
        ad_creative_link_captions: ["example.com"],
        ad_creative_link_descriptions: ["Public description"],
        ad_creative_link_titles: ["Public title"],
        ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=library-1",
        eu_total_reach: 1200,
        impressions: { lower_bound: "1000", upper_bound: "1999" },
        spend: { lower_bound: "100", upper_bound: "199" },
        currency: "EUR",
        access_token: "must-not-survive",
        private_field: "must-not-survive",
      }],
      paging: {
        cursors: { after: "safe_CURSOR-1" },
        next: "https://attacker.invalid/steal?access_token=must-not-survive",
      },
    })) as unknown as typeof fetch;
    const client = createMetaAdLibraryClient({
      accessToken: "meta-secret-token",
      graphApiVersion: "v99.0",
      requestTimeoutMs: 1_000,
    }, fetchImpl);

    const result = await client.listAds({ pageId: "page-1", countries: ["ES"] });

    const [requestUrl, requestInit] = vi.mocked(fetchImpl).mock.calls[0]!;
    const url = new URL(String(requestUrl));
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v99.0/ads_archive");
       expect(url.searchParams.has("access_token")).toBe(false);
    expect(url.searchParams.get("search_page_ids")).toBe('["page-1"]');
    expect(url.searchParams.get("ad_reached_countries")).toBe('["ES"]');
    expect(url.searchParams.get("fields")).not.toContain("access_token");
    expect(new Headers(requestInit?.headers).get("authorization")).toBe("Bearer meta-secret-token");
    expect(result.nextCursor).toBe("safe_CURSOR-1");
    expect(result.ads).toEqual([expect.objectContaining({
      providerAdId: "library-1",
      pageId: "page-1",
      pageName: "Example competitor",
      publisherPlatforms: ["facebook", "instagram"],
      provenance: {
        provider: "meta_ad_library",
        sourceUrl: "https://graph.facebook.com/v99.0/ads_archive",
      },
      metrics: [
        { name: "eu_total_reach", classification: "estimated", exactValue: "1200" },
        { name: "impressions", classification: "range", lowerBound: "1000", upperBound: "1999" },
        { name: "spend", classification: "range", lowerBound: "100", upperBound: "199", currency: "EUR" },
      ],
    })]);
    expect(JSON.stringify(result)).not.toContain("meta-secret-token");
    expect(JSON.stringify(result)).not.toContain("must-not-survive");
  });

  it("ignores paging.next and only accepts a bounded opaque cursor", async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      data: [],
      paging: { cursors: { after: "https://attacker.invalid/path" }, next: "https://attacker.invalid/next" },
    })) as unknown as typeof fetch;
    const client = createMetaAdLibraryClient({
      accessToken: "meta-secret-token",
      graphApiVersion: "v99.0",
      requestTimeoutMs: 1_000,
    }, fetchImpl);

    const result = await client.listAds({ pageId: "page-1", countries: ["ES"] });

    expect(result.nextCursor).toBeUndefined();
  });

  it("fails closed on an invalid API version before making a request", () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(() => createMetaAdLibraryClient({
      accessToken: "meta-secret-token",
      graphApiVersion: "latest",
      requestTimeoutMs: 1_000,
    }, fetchImpl)).toThrow("Meta Graph API version");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("represents missing metrics as unavailable rather than zero", async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      data: [{
        id: "library-2",
        page_id: "page-1",
        page_name: "Example competitor",
        ad_delivery_start_time: "2026-09-01",
        publisher_platforms: ["facebook"],
        ad_snapshot_url: "https://www.facebook.com/ads/library/?id=library-2",
      }],
    })) as unknown as typeof fetch;
    const client = createMetaAdLibraryClient({
      accessToken: "meta-secret-token",
      graphApiVersion: "v99.0",
      requestTimeoutMs: 1_000,
    }, fetchImpl);

    const result = await client.listAds({ pageId: "page-1", countries: ["ES"] });

    expect(result.ads[0]?.metrics).toEqual([
      { name: "eu_total_reach", classification: "unavailable" },
      { name: "impressions", classification: "unavailable" },
      { name: "spend", classification: "unavailable" },
    ]);
  });
});
