import { describe, expect, it, vi } from "vitest";

import type { CompetitorAd, CompetitorAdSyncRepository } from "./sync-service";
import { createCompetitorAdSyncService } from "./sync-service";

const competitor = { id: "competitor-1", metaPageId: "page-1", displayName: "Example competitor", countries: ["ES"] };
const ad: CompetitorAd = {
  providerAdId: "library-1", pageId: "page-1", pageName: "Example competitor",
  deliveryStart: "2026-09-01", deliveryStop: null, publisherPlatforms: ["facebook"],
  creative: { bodies: ["Public creative"], captions: [], descriptions: [], titles: [], snapshotUrl: "https://www.facebook.com/ads/library/?id=library-1" },
  metrics: [
    { name: "eu_total_reach", classification: "estimated", exactValue: "1200" },
    { name: "impressions", classification: "unavailable" },
    { name: "spend", classification: "unavailable" },
  ],
  provenance: { provider: "meta_ad_library", sourceUrl: "https://graph.facebook.com/v99.0/ads_archive" },
};

function repository(overrides: Partial<CompetitorAdSyncRepository> = {}): CompetitorAdSyncRepository {
  return {
    findRunByOperationKey: vi.fn(async () => null),
    listEnabledCompetitors: vi.fn(async () => [competitor]),
    reconcileCompetitor: vi.fn(async () => ({ inserted: 1, unchanged: 0, markedInactive: 0 })),
    saveRunResult: vi.fn(async (run) => run),
    ...overrides,
  };
}

describe("competitor ad daily sync", () => {
  it("reuses an immutable daily result and does not call the provider twice", async () => {
    const existing = {
      id: "run-existing", operationKey: "meta_ad_library:2026-09-11", status: "succeeded" as const,
      startedAt: new Date("2026-09-11T05:00:00.000Z"), completedAt: new Date("2026-09-11T05:00:01.000Z"),
      competitorCount: 1, adsSeen: 1, snapshotsInserted: 1, snapshotsUnchanged: 0,
      adsMarkedInactive: 0, failureCodes: [], coverage: [],
    };
    const repo = repository({ findRunByOperationKey: vi.fn(async () => existing) });
    const client = { listAds: vi.fn() };
    const service = createCompetitorAdSyncService({ repository: repo, client, maxPages: 2 });

    const result = await service.syncDaily({ now: new Date("2026-09-11T06:00:00.000Z") });

    expect(result).toBe(existing);
    expect(client.listAds).not.toHaveBeenCalled();
    expect(repo.saveRunResult).not.toHaveBeenCalled();
  });

  it("follows provider cursors within the page bound and reconciles a complete observation", async () => {
    const repo = repository();
    const client = { listAds: vi.fn().mockResolvedValueOnce({ ads: [ad], nextCursor: "cursor-2" }).mockResolvedValueOnce({ ads: [ad] }) };
    const service = createCompetitorAdSyncService({ repository: repo, client, maxPages: 2 });

    const result = await service.syncDaily({ now: new Date("2026-09-11T06:00:00.000Z") });

    expect(client.listAds).toHaveBeenNthCalledWith(1, { pageId: "page-1", countries: ["ES"] });
    expect(client.listAds).toHaveBeenNthCalledWith(2, { pageId: "page-1", countries: ["ES"], cursor: "cursor-2" });
    expect(repo.reconcileCompetitor).toHaveBeenCalledWith(expect.objectContaining({
      competitorId: "competitor-1", ads: [ad], completeObservation: true, pageCount: 2,
    }));
    expect(result.status).toBe("succeeded");
    expect(result.adsSeen).toBe(1);
  });

  it("never marks missing ads inactive when pagination is truncated", async () => {
    const repo = repository();
    const client = { listAds: vi.fn().mockResolvedValueOnce({ ads: [ad], nextCursor: "cursor-2" }).mockResolvedValueOnce({ ads: [], nextCursor: "cursor-3" }) };
    const service = createCompetitorAdSyncService({ repository: repo, client, maxPages: 2 });

    const result = await service.syncDaily({ now: new Date("2026-09-11T06:00:00.000Z") });

    expect(repo.reconcileCompetitor).toHaveBeenCalledWith(expect.objectContaining({ completeObservation: false }));
    expect(result.status).toBe("partial");
    expect(result.failureCodes).toEqual(["pagination_limit"]);
  });

  it("persists only bounded error codes and continues with other competitors", async () => {
    const second = { ...competitor, id: "competitor-2", metaPageId: "page-2" };
    const repo = repository({ listEnabledCompetitors: vi.fn(async () => [competitor, second]) });
    const client = { listAds: vi.fn().mockRejectedValueOnce(new Error("provider response containing a secret token")).mockResolvedValueOnce({ ads: [ad] }) };
    const service = createCompetitorAdSyncService({ repository: repo, client, maxPages: 2 });

    const result = await service.syncDaily({ now: new Date("2026-09-11T06:00:00.000Z") });

    expect(repo.reconcileCompetitor).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("partial");
    expect(result.failureCodes).toEqual(["provider_error"]);
    expect(JSON.stringify(result)).not.toContain("secret token");
    expect(repo.saveRunResult).toHaveBeenCalledTimes(1);
  });
});
