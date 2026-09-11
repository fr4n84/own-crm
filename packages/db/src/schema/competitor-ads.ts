import { sql } from "drizzle-orm";
import { boolean, check, index, integer, json, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const COMPETITOR_AD_PROVIDER = "meta_ad_library" as const;
export const COMPETITOR_AD_SYNC_STATUS = { SUCCEEDED: "succeeded", PARTIAL: "partial", FAILED: "failed" } as const;
export const COMPETITOR_AD_OBSERVATION_STATUS = { ACTIVE: "active", INACTIVE: "inactive" } as const;

export type CompetitorAdMetric = Readonly<{
  name: "eu_total_reach" | "impressions" | "spend";
  classification: "published" | "estimated" | "range" | "unavailable" | "ai_inferred";
  exactValue?: string;
  lowerBound?: string;
  upperBound?: string;
  currency?: string;
}>;

export type CompetitorAdPublicFields = Readonly<{
  pageId: string;
  pageName: string;
  deliveryStart: string;
  deliveryStop: string | null;
  publisherPlatforms: string[];
  creative: { bodies: string[]; captions: string[]; descriptions: string[]; titles: string[]; snapshotUrl: string };
}>;

export type CompetitorAdProvenance = Readonly<{ provider: typeof COMPETITOR_AD_PROVIDER; sourceUrl: string }>;
export type CompetitorAdCoverage = Readonly<{ competitorId: string; countries: string[]; pageCount: number; complete: boolean }>;

export const competitorAdSources = pgTable("competitor_ad_sources", {
  id: text("id").primaryKey(),
  metaPageId: text("meta_page_id").notNull(),
  displayName: text("display_name").notNull(),
  countries: json("countries").$type<string[]>().notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("competitor_ad_sources_meta_page_uidx").on(table.metaPageId),
  index("competitor_ad_sources_enabled_idx").on(table.enabled, table.displayName),
  check("competitor_ad_sources_page_id_check", sql`${table.metaPageId} ~ '^[0-9]{1,64}$'`),
  check("competitor_ad_sources_display_name_check", sql`NULLIF(BTRIM(${table.displayName}), '') IS NOT NULL`),
  check("competitor_ad_sources_countries_check", sql`json_typeof(${table.countries}) = 'array' AND json_array_length(${table.countries}) BETWEEN 1 AND 25`),
]);

export const competitorAds = pgTable("competitor_ads", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => competitorAdSources.id, { onDelete: "restrict" }),
  providerAdId: text("provider_ad_id").notNull(),
  currentHash: text("current_hash").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  inactiveObservedAt: timestamp("inactive_observed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("competitor_ads_source_provider_uidx").on(table.sourceId, table.providerAdId),
  index("competitor_ads_active_idx").on(table.sourceId, table.isActive, table.lastSeenAt),
  check("competitor_ads_provider_id_check", sql`NULLIF(BTRIM(${table.providerAdId}), '') IS NOT NULL`),
  check("competitor_ads_hash_check", sql`${table.currentHash} ~ '^[a-f0-9]{64}$'`),
  check("competitor_ads_seen_order_check", sql`${table.lastSeenAt} >= ${table.firstSeenAt}`),
  check("competitor_ads_inactive_shape_check", sql`(${table.isActive} AND ${table.inactiveObservedAt} IS NULL) OR (NOT ${table.isActive} AND ${table.inactiveObservedAt} IS NOT NULL)`),
]);

export const competitorAdSnapshots = pgTable("competitor_ad_snapshots", {
  id: text("id").primaryKey(),
  adId: text("ad_id").notNull().references(() => competitorAds.id, { onDelete: "restrict" }),
  syncOperationKey: text("sync_operation_key").notNull(),
  contentHash: text("content_hash").notNull(),
  observationStatus: text("observation_status").$type<"active" | "inactive">().notNull(),
  publicFields: json("public_fields").$type<CompetitorAdPublicFields>().notNull(),
  metrics: json("metrics").$type<CompetitorAdMetric[]>().notNull(),
  provenance: json("provenance").$type<CompetitorAdProvenance>().notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  coverage: json("coverage").$type<CompetitorAdCoverage>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("competitor_ad_snapshots_ad_hash_uidx").on(table.adId, table.syncOperationKey, table.contentHash),
  index("competitor_ad_snapshots_operation_idx").on(table.syncOperationKey, table.retrievedAt),
  check("competitor_ad_snapshots_hash_check", sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
  check("competitor_ad_snapshots_status_check", sql`${table.observationStatus} IN ('active','inactive')`),
]);

export const competitorAdSyncRuns = pgTable("competitor_ad_sync_runs", {
  id: text("id").primaryKey(),
  operationKey: text("operation_key").notNull(),
  provider: text("provider").$type<typeof COMPETITOR_AD_PROVIDER>().notNull(),
  status: text("status").$type<"succeeded" | "partial" | "failed">().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  competitorCount: integer("competitor_count").notNull(),
  adsSeen: integer("ads_seen").notNull(),
  snapshotsInserted: integer("snapshots_inserted").notNull(),
  snapshotsUnchanged: integer("snapshots_unchanged").notNull(),
  adsMarkedInactive: integer("ads_marked_inactive").notNull(),
  failureCodes: json("failure_codes").$type<string[]>().notNull(),
  coverage: json("coverage").$type<CompetitorAdCoverage[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("competitor_ad_sync_runs_operation_key_uidx").on(table.operationKey),
  index("competitor_ad_sync_runs_completed_idx").on(table.completedAt),
  check("competitor_ad_sync_runs_provider_check", sql`${table.provider} = 'meta_ad_library'`),
  check("competitor_ad_sync_runs_status_check", sql`${table.status} IN ('succeeded','partial','failed')`),
  check("competitor_ad_sync_runs_time_check", sql`${table.completedAt} >= ${table.startedAt}`),
  check("competitor_ad_sync_runs_counts_check", sql`${table.competitorCount} >= 0 AND ${table.adsSeen} >= 0 AND ${table.snapshotsInserted} >= 0 AND ${table.snapshotsUnchanged} >= 0 AND ${table.adsMarkedInactive} >= 0`),
]);
