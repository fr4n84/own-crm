import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const tables = new Map<string, unknown>();
  const ads: Array<Record<string, unknown>> = [];
  const snapshots: Array<Record<string, unknown>> = [];

  const tx = {
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: async () => table === tables.get("ads") ? ads : [],
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          if (table === tables.get("ads")) {
            if (!ads.some((ad) => ad.sourceId === values.sourceId && ad.providerAdId === values.providerAdId)) {
              ads.push({ ...values });
            }
            return Promise.resolve();
          }
          const duplicate = snapshots.some((snapshot) => (
            snapshot.adId === values.adId
            && snapshot.syncOperationKey === values.syncOperationKey
            && snapshot.contentHash === values.contentHash
          ));
          if (!duplicate) snapshots.push({ ...values });
          return { returning: async () => duplicate ? [] : [{ id: values.id }] };
        },
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === tables.get("ads") && ads[0]) Object.assign(ads[0], values);
        },
      }),
    })),
  };
  const transaction = vi.fn(async (operation: (value: typeof tx) => unknown) => operation(tx));

  return { tables, ads, snapshots, transaction };
});

vi.mock("@crm-fran/db", () => ({
  and: vi.fn(),
  db: { transaction: database.transaction },
  desc: vi.fn(),
  eq: vi.fn(),
}));

import { competitorAdSnapshots, competitorAds } from "@crm-fran/db/schema/index";

import type { CompetitorAd } from "./sync-service";
import { competitorAdRepository } from "./repository";

const stoppedAd: CompetitorAd = {
  providerAdId: "library-1",
  pageId: "page-1",
  pageName: "Example competitor",
  deliveryStart: "2026-09-01",
  deliveryStop: "2026-09-10",
  publisherPlatforms: ["facebook"],
  creative: {
    bodies: ["Public creative"],
    captions: [],
    descriptions: [],
    titles: [],
    snapshotUrl: "https://www.facebook.com/ads/library/?id=library-1",
  },
  metrics: [{ name: "eu_total_reach", classification: "estimated", exactValue: "1200" }],
  provenance: { provider: "meta_ad_library", sourceUrl: "https://graph.facebook.com/v99.0/ads_archive" },
};

describe("competitor ad persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.tables.set("ads", competitorAds);
    database.tables.set("snapshots", competitorAdSnapshots);
    database.ads.length = 0;
    database.snapshots.length = 0;
  });

  it("persists an ad first observed after delivery stopped and reconciles it idempotently", async () => {
    const retrievedAt = new Date("2026-09-11T05:00:00.000Z");
    const input = {
      competitorId: "competitor-1",
      countries: ["ES"],
      ads: [stoppedAd],
      retrievedAt,
      syncOperationKey: "meta_ad_library:2026-09-11",
      pageCount: 1,
      completeObservation: false,
    };

    const first = await competitorAdRepository.reconcileCompetitor(input);
    const second = await competitorAdRepository.reconcileCompetitor(input);

    expect(first).toEqual({ inserted: 1, unchanged: 0, markedInactive: 0 });
    expect(second).toEqual({ inserted: 0, unchanged: 1, markedInactive: 0 });
    expect(database.ads).toHaveLength(1);
    expect(database.ads[0]).toMatchObject({ isActive: false, inactiveObservedAt: retrievedAt });
    expect(database.snapshots).toHaveLength(1);
    expect(database.snapshots[0]).toMatchObject({ observationStatus: "inactive", retrievedAt });
  });
});
