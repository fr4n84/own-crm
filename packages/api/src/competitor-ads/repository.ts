import { createHash, randomUUID } from "node:crypto";

import { and, db, desc, eq } from "@crm-fran/db";
import { competitorAdSnapshots, competitorAdSources, competitorAdSyncRuns, competitorAds } from "@crm-fran/db/schema/index";

import type { CompetitorAd, CompetitorAdCoverage, CompetitorAdSyncRepository, CompetitorAdSyncRun } from "./sync-service";

function contentHash(status: "active" | "inactive", publicFields: object, metrics: object, provenance: object) {
  return createHash("sha256").update(JSON.stringify({ status, publicFields, metrics, provenance }), "utf8").digest("hex");
}

function publicFields(ad: CompetitorAd) {
  return {
    pageId: ad.pageId,
    pageName: ad.pageName,
    deliveryStart: ad.deliveryStart,
    deliveryStop: ad.deliveryStop,
    publisherPlatforms: ad.publisherPlatforms,
    creative: ad.creative,
  };
}

export const competitorAdRepository: CompetitorAdSyncRepository & {
  listSources(): Promise<Array<typeof competitorAdSources.$inferSelect>>;
  upsertSource(input: { id?: string; metaPageId: string; displayName: string; countries: string[]; enabled: boolean; actorId: string; now: Date }): Promise<typeof competitorAdSources.$inferSelect>;
  setSourceEnabled(input: { id: string; enabled: boolean; now: Date }): Promise<boolean>;
  listRecentRuns(limit: number): Promise<Array<typeof competitorAdSyncRuns.$inferSelect>>;
} = {
  async findRunByOperationKey(operationKey) {
    const [run] = await db.select().from(competitorAdSyncRuns).where(eq(competitorAdSyncRuns.operationKey, operationKey)).limit(1);
    return (run as CompetitorAdSyncRun | undefined) ?? null;
  },

  async listEnabledCompetitors() {
    return db.select({
      id: competitorAdSources.id,
      metaPageId: competitorAdSources.metaPageId,
      displayName: competitorAdSources.displayName,
      countries: competitorAdSources.countries,
    }).from(competitorAdSources).where(eq(competitorAdSources.enabled, true)).orderBy(competitorAdSources.displayName);
  },

  async reconcileCompetitor(input) {
    return db.transaction(async (tx) => {
      let inserted = 0;
      let unchanged = 0;
      let markedInactive = 0;
      const known = await tx.select().from(competitorAds).where(eq(competitorAds.sourceId, input.competitorId));
      const byProviderId = new Map(known.map((item) => [item.providerAdId, item]));
      const observedIds = new Set<string>();
      const coverage: CompetitorAdCoverage = {
        competitorId: input.competitorId,
        countries: input.countries,
        pageCount: input.pageCount,
        complete: input.completeObservation,
      };

      for (const ad of input.ads) {
        observedIds.add(ad.providerAdId);
        const fields = publicFields(ad);
        const observationStatus = ad.deliveryStop ? "inactive" : "active";
        const isActive = observationStatus === "active";
        const hash = contentHash(observationStatus, fields, ad.metrics, ad.provenance);
        const current = byProviderId.get(ad.providerAdId);
        const adId = current?.id ?? randomUUID();
        if (!current) {
          await tx.insert(competitorAds).values({
            id: adId,
            sourceId: input.competitorId,
            providerAdId: ad.providerAdId,
            currentHash: hash,
            firstSeenAt: input.retrievedAt,
            lastSeenAt: input.retrievedAt,
            isActive: true,
            inactiveObservedAt: null,
            createdAt: input.retrievedAt,
            updatedAt: input.retrievedAt,
          }).onConflictDoNothing();
        } else {
          await tx.update(competitorAds).set({
            currentHash: hash,
            lastSeenAt: input.retrievedAt,
            isActive: true,
            inactiveObservedAt: null,
            updatedAt: input.retrievedAt,
          }).where(eq(competitorAds.id, current.id));
        }

        if (!current || current.currentHash !== hash || current.isActive !== isActive) {
          const snapshot = await tx.insert(competitorAdSnapshots).values({
            id: randomUUID(),
            adId,
            syncOperationKey: input.syncOperationKey,
            contentHash: hash,
            observationStatus,
            publicFields: fields,
            metrics: ad.metrics,
            provenance: ad.provenance,
            retrievedAt: input.retrievedAt,
            coverage,
            createdAt: input.retrievedAt,
          }).onConflictDoNothing().returning({ id: competitorAdSnapshots.id });
          inserted += snapshot.length;
          unchanged += snapshot.length === 0 ? 1 : 0;
        } else {
          unchanged += 1;
        }
      }

      if (input.completeObservation) {
        for (const current of known) {
          if (!current.isActive || observedIds.has(current.providerAdId)) continue;
          const [latest] = await tx.select({
            publicFields: competitorAdSnapshots.publicFields,
            metrics: competitorAdSnapshots.metrics,
            provenance: competitorAdSnapshots.provenance,
          }).from(competitorAdSnapshots).where(eq(competitorAdSnapshots.adId, current.id)).orderBy(desc(competitorAdSnapshots.createdAt)).limit(1);
          if (!latest) continue;
          const hash = contentHash("inactive", latest.publicFields, latest.metrics, latest.provenance);
          await tx.update(competitorAds).set({
            currentHash: hash,
            isActive: false,
            inactiveObservedAt: input.retrievedAt,
            updatedAt: input.retrievedAt,
          }).where(and(eq(competitorAds.id, current.id), eq(competitorAds.isActive, true)));
          const snapshot = await tx.insert(competitorAdSnapshots).values({
            id: randomUUID(),
            adId: current.id,
            syncOperationKey: input.syncOperationKey,
            contentHash: hash,
            observationStatus: "inactive",
            publicFields: latest.publicFields,
            metrics: latest.metrics,
            provenance: latest.provenance,
            retrievedAt: input.retrievedAt,
            coverage,
            createdAt: input.retrievedAt,
          }).onConflictDoNothing().returning({ id: competitorAdSnapshots.id });
          markedInactive += snapshot.length;
          inserted += snapshot.length;
        }
      }
      return { inserted, unchanged, markedInactive };
    });
  },

  async saveRunResult(run) {
    const saved = await db.insert(competitorAdSyncRuns).values({
      ...run,
      provider: "meta_ad_library",
    }).onConflictDoNothing({ target: competitorAdSyncRuns.operationKey }).returning();
    if (saved[0]) return saved[0] as CompetitorAdSyncRun;
    const existing = await this.findRunByOperationKey(run.operationKey);
    if (!existing) throw new Error("Competitor ad sync result was not persisted");
    return existing;
  },

  async listSources() {
    return db.select().from(competitorAdSources).orderBy(competitorAdSources.displayName);
  },

  async upsertSource(input) {
    const id = input.id ?? randomUUID();
    const rows = await db.insert(competitorAdSources).values({
      id,
      metaPageId: input.metaPageId,
      displayName: input.displayName,
      countries: input.countries,
      enabled: input.enabled,
      createdById: input.actorId,
      createdAt: input.now,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: competitorAdSources.metaPageId,
      set: {
        displayName: input.displayName,
        countries: input.countries,
        enabled: input.enabled,
        updatedAt: input.now,
      },
    }).returning();
    const source = rows[0];
    if (!source) throw new Error("Competitor ad source was not persisted");
    return source;
  },

  async setSourceEnabled(input) {
    const rows = await db.update(competitorAdSources).set({ enabled: input.enabled, updatedAt: input.now })
      .where(eq(competitorAdSources.id, input.id)).returning({ id: competitorAdSources.id });
    return rows.length === 1;
  },

  async listRecentRuns(limit) {
    return db.select().from(competitorAdSyncRuns).orderBy(desc(competitorAdSyncRuns.completedAt)).limit(limit);
  },
};
