import { randomUUID } from "node:crypto";

export type CompetitorAdMetric = Readonly<{
  name: "eu_total_reach" | "impressions" | "spend";
  classification: "published" | "estimated" | "range" | "unavailable" | "ai_inferred";
  exactValue?: string;
  lowerBound?: string;
  upperBound?: string;
  currency?: string;
}>;

export type CompetitorAd = Readonly<{
  providerAdId: string;
  pageId: string;
  pageName: string;
  deliveryStart: string;
  deliveryStop: string | null;
  publisherPlatforms: string[];
  creative: {
    bodies: string[];
    captions: string[];
    descriptions: string[];
    titles: string[];
    snapshotUrl: string;
  };
  metrics: CompetitorAdMetric[];
  provenance: { provider: "meta_ad_library"; sourceUrl: string };
}>;

export type CompetitorAdSource = Readonly<{
  id: string;
  metaPageId: string;
  displayName: string;
  countries: string[];
}>;

export type CompetitorAdCoverage = Readonly<{
  competitorId: string;
  countries: string[];
  pageCount: number;
  complete: boolean;
}>;

export type CompetitorAdSyncRun = Readonly<{
  id: string;
  operationKey: string;
  status: "succeeded" | "partial" | "failed";
  startedAt: Date;
  completedAt: Date;
  competitorCount: number;
  adsSeen: number;
  snapshotsInserted: number;
  snapshotsUnchanged: number;
  adsMarkedInactive: number;
  failureCodes: Array<"pagination_limit" | "provider_error">;
  coverage: CompetitorAdCoverage[];
}>;

export type AdLibraryClient = {
  listAds(input: { pageId: string; countries: string[]; cursor?: string }): Promise<{ ads: CompetitorAd[]; nextCursor?: string }>;
};

export type CompetitorAdSyncRepository = {
  findRunByOperationKey(operationKey: string): Promise<CompetitorAdSyncRun | null>;
  listEnabledCompetitors(): Promise<CompetitorAdSource[]>;
  reconcileCompetitor(input: {
    competitorId: string;
    ads: CompetitorAd[];
    retrievedAt: Date;
    syncOperationKey: string;
    countries: string[];
    pageCount: number;
    completeObservation: boolean;
  }): Promise<{ inserted: number; unchanged: number; markedInactive: number }>;
  saveRunResult(run: CompetitorAdSyncRun): Promise<CompetitorAdSyncRun>;
};

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function createCompetitorAdSyncService(input: {
  repository: CompetitorAdSyncRepository;
  client: AdLibraryClient;
  maxPages: number;
}) {
  if (!Number.isInteger(input.maxPages) || input.maxPages < 1 || input.maxPages > 50) {
    throw new Error("Competitor ad sync page limit must be between 1 and 50");
  }

  return {
    async syncDaily(command: { now: Date }): Promise<CompetitorAdSyncRun> {
      const startedAt = command.now;
      const operationKey = `meta_ad_library:${utcDay(command.now)}`;
      const existing = await input.repository.findRunByOperationKey(operationKey);
      if (existing) return existing;

      const competitors = await input.repository.listEnabledCompetitors();
      let adsSeen = 0;
      let snapshotsInserted = 0;
      let snapshotsUnchanged = 0;
      let adsMarkedInactive = 0;
      let completedCompetitors = 0;
      const failureCodes: CompetitorAdSyncRun["failureCodes"] = [];
      const coverage: CompetitorAdCoverage[] = [];

      for (const competitor of competitors) {
        const adsById = new Map<string, CompetitorAd>();
        let nextCursor: string | undefined;
        let pageCount = 0;
        let completeObservation = false;
        try {
          do {
            const page = await input.client.listAds({
              pageId: competitor.metaPageId,
              countries: competitor.countries,
              ...(nextCursor ? { cursor: nextCursor } : {}),
            });
            pageCount += 1;
            for (const ad of page.ads) {
              if (ad.pageId === competitor.metaPageId) adsById.set(ad.providerAdId, ad);
            }
            nextCursor = page.nextCursor;
            if (!nextCursor) completeObservation = true;
          } while (nextCursor && pageCount < input.maxPages);

          if (!completeObservation) failureCodes.push("pagination_limit");
          const ads = [...adsById.values()];
          const reconciliation = await input.repository.reconcileCompetitor({
            competitorId: competitor.id,
            ads,
            retrievedAt: command.now,
            syncOperationKey: operationKey,
            countries: competitor.countries,
            pageCount,
            completeObservation,
          });
          adsSeen += ads.length;
          snapshotsInserted += reconciliation.inserted;
          snapshotsUnchanged += reconciliation.unchanged;
          adsMarkedInactive += reconciliation.markedInactive;
          completedCompetitors += 1;
          coverage.push({ competitorId: competitor.id, countries: competitor.countries, pageCount, complete: completeObservation });
        } catch {
          failureCodes.push("provider_error");
          coverage.push({ competitorId: competitor.id, countries: competitor.countries, pageCount, complete: false });
        }
      }

      const status = failureCodes.length === 0
        ? "succeeded"
        : completedCompetitors === 0
          ? "failed"
          : "partial";
      const run: CompetitorAdSyncRun = {
        id: randomUUID(),
        operationKey,
        status,
        startedAt,
        completedAt: new Date(),
        competitorCount: competitors.length,
        adsSeen,
        snapshotsInserted,
        snapshotsUnchanged,
        adsMarkedInactive,
        failureCodes,
        coverage,
      };
      return input.repository.saveRunResult(run);
    },
  };
}
