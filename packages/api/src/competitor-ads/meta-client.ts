import { z } from "zod/v4";

import type { AdLibraryClient, CompetitorAd, CompetitorAdMetric } from "./sync-service";

const META_FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
  "ad_creative_bodies",
  "ad_creative_link_captions",
  "ad_creative_link_descriptions",
  "ad_creative_link_titles",
  "ad_snapshot_url",
  "eu_total_reach",
  "impressions",
  "spend",
  "currency",
] as const;
const graphApiVersion = z.string().regex(/^v\d+\.\d+$/);
const cursor = z.string().regex(/^[A-Za-z0-9._~+=/-]{1,2048}$/);
const numericText = z.union([z.string(), z.number()]).transform(String);
const range = z.object({
  lower_bound: numericText,
  upper_bound: numericText,
});
const rawAd = z.object({
  id: z.string().min(1).max(200),
  page_id: z.string().min(1).max(200),
  page_name: z.string().min(1).max(500),
  ad_delivery_start_time: z.string().min(1).max(64),
  ad_delivery_stop_time: z.string().min(1).max(64).nullable().optional(),
  publisher_platforms: z.array(z.string().min(1).max(64)).max(20).default([]),
  ad_creative_bodies: z.array(z.string().max(20_000)).max(100).default([]),
  ad_creative_link_captions: z.array(z.string().max(2_000)).max(100).default([]),
  ad_creative_link_descriptions: z.array(z.string().max(20_000)).max(100).default([]),
  ad_creative_link_titles: z.array(z.string().max(2_000)).max(100).default([]),
  ad_snapshot_url: z.url(),
  eu_total_reach: numericText.optional(),
  impressions: range.optional(),
  spend: range.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});
const responseSchema = z.object({
  data: z.array(rawAd).max(1_000).default([]),
  paging: z.object({
    cursors: z.object({ after: z.string().optional() }).optional(),
  }).optional(),
});

export class MetaAdLibraryProviderError extends Error {
  constructor() {
    super("Meta Ad Library request failed");
    this.name = "MetaAdLibraryProviderError";
  }
}

function unavailable(name: CompetitorAdMetric["name"]): CompetitorAdMetric {
  return { name, classification: "unavailable" };
}

function mapAd(ad: z.infer<typeof rawAd>, sourceUrl: string): CompetitorAd {
  return {
    providerAdId: ad.id,
    pageId: ad.page_id,
    pageName: ad.page_name,
    deliveryStart: ad.ad_delivery_start_time,
    deliveryStop: ad.ad_delivery_stop_time ?? null,
    publisherPlatforms: [...ad.publisher_platforms],
    creative: {
      bodies: [...ad.ad_creative_bodies],
      captions: [...ad.ad_creative_link_captions],
      descriptions: [...ad.ad_creative_link_descriptions],
      titles: [...ad.ad_creative_link_titles],
      snapshotUrl: ad.ad_snapshot_url,
    },
    metrics: [
      ad.eu_total_reach === undefined
        ? unavailable("eu_total_reach")
        : { name: "eu_total_reach", classification: "estimated", exactValue: ad.eu_total_reach },
      ad.impressions === undefined
        ? unavailable("impressions")
        : { name: "impressions", classification: "range", lowerBound: ad.impressions.lower_bound, upperBound: ad.impressions.upper_bound },
      ad.spend === undefined
        ? unavailable("spend")
        : {
          name: "spend",
          classification: "range",
          lowerBound: ad.spend.lower_bound,
          upperBound: ad.spend.upper_bound,
          ...(ad.currency ? { currency: ad.currency } : {}),
        },
    ],
    provenance: { provider: "meta_ad_library", sourceUrl },
  };
}

export function createMetaAdLibraryClient(
  config: { accessToken: string; graphApiVersion: string; requestTimeoutMs: number },
  fetchImpl: typeof fetch = fetch,
): AdLibraryClient {
  const parsedVersion = graphApiVersion.safeParse(config.graphApiVersion);
  if (!parsedVersion.success) throw new Error("Meta Graph API version must be explicitly configured as v<number>.<number>");
  if (!config.accessToken.trim()) throw new Error("Meta access token is required");
  if (!Number.isInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 100 || config.requestTimeoutMs > 60_000) {
    throw new Error("Meta request timeout must be between 100 and 60000 milliseconds");
  }
  const sourceUrl = `https://graph.facebook.com/${parsedVersion.data}/ads_archive`;

  return {
    async listAds(input) {
      const url = new URL(sourceUrl);
      url.searchParams.set("search_page_ids", JSON.stringify([input.pageId]));
      url.searchParams.set("ad_reached_countries", JSON.stringify(input.countries));
      url.searchParams.set("ad_active_status", "ALL");
      url.searchParams.set("fields", META_FIELDS.join(","));
      url.searchParams.set("limit", "100");
      if (input.cursor) {
        const parsedCursor = cursor.safeParse(input.cursor);
        if (!parsedCursor.success) throw new MetaAdLibraryProviderError();
        url.searchParams.set("after", parsedCursor.data);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${config.accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new MetaAdLibraryProviderError();
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) throw new MetaAdLibraryProviderError();
        const after = parsed.data.paging?.cursors?.after;
        const parsedAfter = after ? cursor.safeParse(after) : null;
        return {
          ads: parsed.data.data.map((item) => mapAd(item, sourceUrl)),
          ...(parsedAfter?.success ? { nextCursor: parsedAfter.data } : {}),
        };
      } catch (error) {
        if (error instanceof MetaAdLibraryProviderError) throw error;
        throw new MetaAdLibraryProviderError();
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
