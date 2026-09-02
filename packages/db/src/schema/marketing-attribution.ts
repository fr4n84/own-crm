import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { leads } from "./leads";

export const MARKETING_CAMPAIGN_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  ARCHIVED: "archived",
} as const;

export const MARKETING_CREATIVE_STATUS = {
  PUBLISHED: "published",
  ARCHIVED: "archived",
} as const;

export const MARKETING_CREATIVE_FORMAT = {
  VIDEO: "video",
  IMAGE: "image",
  AUDIO: "audio",
  TEXT: "text",
  OTHER: "other",
} as const;

export const MARKETING_ANALYSIS_STATUS = {
  NOT_REQUESTED: "not_requested",
  SUGGESTED: "suggested",
  APPROVED: "approved",
  FAILED: "failed",
} as const;

export const MARKETING_RULE_STATUS = {
  PUBLISHED: "published",
  ARCHIVED: "archived",
} as const;

export const MARKETING_ATTRIBUTION_MATCH_KIND = {
  AUTOMATIC: "automatic",
  BACKFILL: "backfill",
  MANUAL: "manual",
} as const;

export type MarketingCampaignStatus =
  (typeof MARKETING_CAMPAIGN_STATUS)[keyof typeof MARKETING_CAMPAIGN_STATUS];
export type MarketingCreativeStatus =
  (typeof MARKETING_CREATIVE_STATUS)[keyof typeof MARKETING_CREATIVE_STATUS];
export type MarketingCreativeFormat =
  (typeof MARKETING_CREATIVE_FORMAT)[keyof typeof MARKETING_CREATIVE_FORMAT];
export type MarketingAnalysisStatus =
  (typeof MARKETING_ANALYSIS_STATUS)[keyof typeof MARKETING_ANALYSIS_STATUS];
export type MarketingRuleStatus =
  (typeof MARKETING_RULE_STATUS)[keyof typeof MARKETING_RULE_STATUS];
export type MarketingAttributionMatchKind =
  (typeof MARKETING_ATTRIBUTION_MATCH_KIND)[keyof typeof MARKETING_ATTRIBUTION_MATCH_KIND];

export type MarketingCreativeAiAnalysis = {
  angleSuggestion?: string | null;
  hook?: string | null;
  promise?: string | null;
  cta?: string | null;
  targetProfile?: string | null;
  objections?: string[];
  awarenessStage?: string | null;
  confidence?: number;
  model?: string;
  analyzedAt?: string;
};

export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceKey: text("source_key").notNull(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    externalId: text("external_id"),
    status: text("status")
      .$type<MarketingCampaignStatus>()
      .default(MARKETING_CAMPAIGN_STATUS.ACTIVE)
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("marketing_campaigns_source_name_uidx").on(
      table.sourceKey,
      table.nameKey,
    ),
    check(
      "marketing_campaigns_status_check",
      sql`${table.status} IN ('active', 'paused', 'archived')`,
    ),
  ],
);

export const marketingAngles = pgTable(
  "marketing_angles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    description: text("description"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("marketing_angles_name_uidx").on(table.nameKey)],
);

export const marketingCreativeVersions = pgTable(
  "marketing_creative_versions",
  {
    id: text("id").primaryKey(),
    lineageKey: text("lineage_key").notNull(),
    version: integer("version").notNull(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => marketingCampaigns.id, { onDelete: "restrict" }),
    angleId: text("angle_id").references(() => marketingAngles.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<MarketingCreativeStatus>()
      .default(MARKETING_CREATIVE_STATUS.PUBLISHED)
      .notNull(),
    name: text("name").notNull(),
    format: text("format")
      .$type<MarketingCreativeFormat>()
      .default(MARKETING_CREATIVE_FORMAT.OTHER)
      .notNull(),
    assetStorageKey: text("asset_storage_key"),
    assetFileName: text("asset_file_name"),
    assetMimeType: text("asset_mime_type"),
    assetSizeBytes: integer("asset_size_bytes"),
    assetChecksum: text("asset_checksum"),
    transcript: text("transcript"),
    hook: text("hook"),
    promise: text("promise"),
    cta: text("cta"),
    targetProfile: text("target_profile"),
    objections: json("objections").$type<string[]>().default([]).notNull(),
    awarenessStage: text("awareness_stage"),
    aiAnalysisStatus: text("ai_analysis_status")
      .$type<MarketingAnalysisStatus>()
      .default(MARKETING_ANALYSIS_STATUS.NOT_REQUESTED)
      .notNull(),
    aiAnalysis: json("ai_analysis")
      .$type<MarketingCreativeAiAnalysis>()
      .default({})
      .notNull(),
    parentVersionId: text("parent_version_id").references(
      (): AnyPgColumn => marketingCreativeVersions.id,
      { onDelete: "restrict" },
    ),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approvedById: text("approved_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("marketing_creative_lineage_version_uidx").on(
      table.lineageKey,
      table.version,
    ),
    index("marketing_creative_campaign_status_idx").on(
      table.campaignId,
      table.status,
    ),
    check(
      "marketing_creative_status_check",
      sql`${table.status} IN ('published', 'archived')`,
    ),
    check(
      "marketing_creative_format_check",
      sql`${table.format} IN ('video', 'image', 'audio', 'text', 'other')`,
    ),
    check(
      "marketing_creative_analysis_status_check",
      sql`${table.aiAnalysisStatus} IN ('not_requested', 'suggested', 'approved', 'failed')`,
    ),
    check(
      "marketing_creative_version_check",
      sql`${table.version} >= 1`,
    ),
    check(
      "marketing_creative_asset_size_check",
      sql`${table.assetSizeBytes} IS NULL OR ${table.assetSizeBytes} > 0`,
    ),
  ],
);

export const marketingAttributionRuleVersions = pgTable(
  "marketing_attribution_rule_versions",
  {
    id: text("id").primaryKey(),
    lineageKey: text("lineage_key").notNull(),
    version: integer("version").notNull(),
    status: text("status")
      .$type<MarketingRuleStatus>()
      .default(MARKETING_RULE_STATUS.PUBLISHED)
      .notNull(),
    leadSource: text("lead_source"),
    sourceKey: text("source_key").default("").notNull(),
    utmContent: text("utm_content").notNull(),
    utmContentKey: text("utm_content_key").notNull(),
    creativeVersionId: text("creative_version_id")
      .notNull()
      .references(() => marketingCreativeVersions.id, { onDelete: "restrict" }),
    validFrom: timestamp("valid_from"),
    validTo: timestamp("valid_to"),
    parentVersionId: text("parent_version_id").references(
      (): AnyPgColumn => marketingAttributionRuleVersions.id,
      { onDelete: "restrict" },
    ),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approvedById: text("approved_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("marketing_rule_lineage_version_uidx").on(
      table.lineageKey,
      table.version,
    ),
    index("marketing_rule_match_idx").on(
      table.sourceKey,
      table.utmContentKey,
      table.status,
      table.validFrom,
      table.validTo,
    ),
    check(
      "marketing_rule_status_check",
      sql`${table.status} IN ('published', 'archived')`,
    ),
    check("marketing_rule_version_check", sql`${table.version} >= 1`),
    check(
      "marketing_rule_dates_check",
      sql`${table.validFrom} IS NULL OR ${table.validTo} IS NULL OR ${table.validTo} >= ${table.validFrom}`,
    ),
  ],
);

export const leadMarketingAttributions = pgTable(
  "lead_marketing_attributions",
  {
    leadId: text("lead_id")
      .primaryKey()
      .references(() => leads.id, { onDelete: "cascade" }),
    ruleVersionId: text("rule_version_id")
      .notNull()
      .references(() => marketingAttributionRuleVersions.id, {
        onDelete: "restrict",
      }),
    creativeVersionId: text("creative_version_id")
      .notNull()
      .references(() => marketingCreativeVersions.id, { onDelete: "restrict" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => marketingCampaigns.id, { onDelete: "restrict" }),
    angleId: text("angle_id").references(() => marketingAngles.id, {
      onDelete: "set null",
    }),
    sourceSnapshot: text("source_snapshot"),
    utmContentSnapshot: text("utm_content_snapshot").notNull(),
    matchKind: text("match_kind")
      .$type<MarketingAttributionMatchKind>()
      .notNull(),
    attributedById: text("attributed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    attributedAt: timestamp("attributed_at").defaultNow().notNull(),
  },
  (table) => [
    index("lead_marketing_attribution_rule_idx").on(table.ruleVersionId),
    index("lead_marketing_attribution_campaign_idx").on(table.campaignId),
    index("lead_marketing_attribution_creative_idx").on(
      table.creativeVersionId,
    ),
    check(
      "lead_marketing_attribution_match_kind_check",
      sql`${table.matchKind} IN ('automatic', 'backfill', 'manual')`,
    ),
  ],
);

export const marketingCampaignRelations = relations(
  marketingCampaigns,
  ({ one, many }) => ({
    createdBy: one(user, {
      fields: [marketingCampaigns.createdById],
      references: [user.id],
    }),
    creativeVersions: many(marketingCreativeVersions),
  }),
);

export const marketingAngleRelations = relations(
  marketingAngles,
  ({ one, many }) => ({
    createdBy: one(user, {
      fields: [marketingAngles.createdById],
      references: [user.id],
    }),
    creativeVersions: many(marketingCreativeVersions),
  }),
);

export const marketingCreativeVersionRelations = relations(
  marketingCreativeVersions,
  ({ one, many }) => ({
    campaign: one(marketingCampaigns, {
      fields: [marketingCreativeVersions.campaignId],
      references: [marketingCampaigns.id],
    }),
    angle: one(marketingAngles, {
      fields: [marketingCreativeVersions.angleId],
      references: [marketingAngles.id],
    }),
    parentVersion: one(marketingCreativeVersions, {
      fields: [marketingCreativeVersions.parentVersionId],
      references: [marketingCreativeVersions.id],
      relationName: "marketingCreativeParent",
    }),
    rules: many(marketingAttributionRuleVersions),
  }),
);

export const marketingAttributionRuleVersionRelations = relations(
  marketingAttributionRuleVersions,
  ({ one, many }) => ({
    creativeVersion: one(marketingCreativeVersions, {
      fields: [marketingAttributionRuleVersions.creativeVersionId],
      references: [marketingCreativeVersions.id],
    }),
    parentVersion: one(marketingAttributionRuleVersions, {
      fields: [marketingAttributionRuleVersions.parentVersionId],
      references: [marketingAttributionRuleVersions.id],
      relationName: "marketingRuleParent",
    }),
    leadAttributions: many(leadMarketingAttributions),
  }),
);

export const leadMarketingAttributionRelations = relations(
  leadMarketingAttributions,
  ({ one }) => ({
    lead: one(leads, {
      fields: [leadMarketingAttributions.leadId],
      references: [leads.id],
    }),
    ruleVersion: one(marketingAttributionRuleVersions, {
      fields: [leadMarketingAttributions.ruleVersionId],
      references: [marketingAttributionRuleVersions.id],
    }),
    creativeVersion: one(marketingCreativeVersions, {
      fields: [leadMarketingAttributions.creativeVersionId],
      references: [marketingCreativeVersions.id],
    }),
    campaign: one(marketingCampaigns, {
      fields: [leadMarketingAttributions.campaignId],
      references: [marketingCampaigns.id],
    }),
    angle: one(marketingAngles, {
      fields: [leadMarketingAttributions.angleId],
      references: [marketingAngles.id],
    }),
  }),
);
