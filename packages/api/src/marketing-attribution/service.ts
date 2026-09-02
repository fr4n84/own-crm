import { and, asc, db, desc, eq, isNotNull, sql } from "@crm-fran/db";
import {
  leadMarketingAttributions,
  leads,
  marketingAngles,
  marketingAttributionRuleVersions,
  marketingCampaigns,
  marketingCreativeVersions,
  MARKETING_ANALYSIS_STATUS,
  MARKETING_ATTRIBUTION_MATCH_KIND,
  MARKETING_CREATIVE_STATUS,
  MARKETING_RULE_STATUS,
  type LeadQASession,
  type MarketingAttributionMatchKind,
  type MarketingCreativeAiAnalysis,
  type MarketingCreativeFormat,
} from "@crm-fran/db/schema/index";
import { TRPCError } from "@trpc/server";

import {
  attributionRuleMatchesLead,
  dateWindowsOverlap,
  normalizeMarketingKey,
  summarizeAttributionCoverage,
} from "./domain";

type MarketingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type MediaMetadata = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};

export type SaveMarketingMappingInput = {
  ruleLineageKey?: string;
  creativeLineageKey?: string;
  leadSource?: string | null;
  utmContent: string;
  validFrom?: Date | null;
  validTo?: Date | null;
  campaignSource: string;
  campaignName: string;
  campaignExternalId?: string | null;
  creativeName: string;
  creativeFormat: MarketingCreativeFormat;
  media?: MediaMetadata | null;
  transcript?: string | null;
  angleName?: string | null;
  angleDescription?: string | null;
  hook?: string | null;
  promise?: string | null;
  cta?: string | null;
  targetProfile?: string | null;
  objections?: string[];
  awarenessStage?: string | null;
  aiAnalysis?: MarketingCreativeAiAnalysis;
  reprocessExisting?: boolean;
  actorId: string;
};

function latestByLineage<T extends { lineageKey: string; version: number }>(
  rows: readonly T[],
) {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(row.lineageKey);
    if (!current || row.version > current.version) latest.set(row.lineageKey, row);
  }
  return [...latest.values()];
}

function nonEmpty(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function leadOutcome(lead: {
  questions: LeadQASession;
  response: string;
  feedback: string;
}) {
  const answers = [
    ...lead.questions.map((question) => question.answer),
    lead.response,
    lead.feedback,
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

  return {
    appointment: /\bagenda|agendad|reagenda/.test(answers),
    sale: /\bventa\b|vendido|cerrado/.test(answers),
    noShow: /no[ -]?show|no asist/.test(answers),
    notInterested: /no interes/.test(answers),
  };
}

function addMetric(
  metrics: Map<
    string,
    {
      id: string;
      label: string;
      leads: number;
      appointments: number;
      sales: number;
      noShows: number;
      notInterested: number;
    }
  >,
  key: string,
  label: string,
  outcome: ReturnType<typeof leadOutcome>,
) {
  const metric = metrics.get(key) ?? {
    id: key,
    label,
    leads: 0,
    appointments: 0,
    sales: 0,
    noShows: 0,
    notInterested: 0,
  };
  metric.leads += 1;
  metric.appointments += Number(outcome.appointment);
  metric.sales += Number(outcome.sale);
  metric.noShows += Number(outcome.noShow);
  metric.notInterested += Number(outcome.notInterested);
  metrics.set(key, metric);
}

function withRates<T extends { leads: number; appointments: number; sales: number }>(
  metric: T,
) {
  return {
    ...metric,
    appointmentRate:
      metric.leads === 0 ? 0 : Math.round((metric.appointments / metric.leads) * 10_000) / 100,
    saleRate:
      metric.leads === 0 ? 0 : Math.round((metric.sales / metric.leads) * 10_000) / 100,
  };
}

async function findOrCreateCampaign(
  tx: MarketingTransaction,
  input: SaveMarketingMappingInput,
) {
  const sourceKey = normalizeMarketingKey(input.campaignSource);
  const nameKey = normalizeMarketingKey(input.campaignName);
  const [existing] = await tx
    .select()
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.sourceKey, sourceKey),
        eq(marketingCampaigns.nameKey, nameKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [created] = await tx
    .insert(marketingCampaigns)
    .values({
      id: crypto.randomUUID(),
      source: input.campaignSource.trim(),
      sourceKey,
      name: input.campaignName.trim(),
      nameKey,
      externalId: nonEmpty(input.campaignExternalId),
      createdById: input.actorId,
    })
    .returning();
  return created!;
}

async function findOrCreateAngle(
  tx: MarketingTransaction,
  input: SaveMarketingMappingInput,
) {
  const name = nonEmpty(input.angleName);
  if (!name) return null;
  const nameKey = normalizeMarketingKey(name);
  const [existing] = await tx
    .select()
    .from(marketingAngles)
    .where(eq(marketingAngles.nameKey, nameKey))
    .limit(1);
  if (existing) return existing;

  const [created] = await tx
    .insert(marketingAngles)
    .values({
      id: crypto.randomUUID(),
      name,
      nameKey,
      description: nonEmpty(input.angleDescription),
      createdById: input.actorId,
    })
    .returning();
  return created!;
}

async function matchingPublishedRule(
  tx: MarketingTransaction,
  lead: { source: string | null; utmContent: string | null; createdAt: Date },
) {
  if (!lead.utmContent) return null;
  const rows = await tx
    .select()
    .from(marketingAttributionRuleVersions)
    .where(eq(marketingAttributionRuleVersions.status, MARKETING_RULE_STATUS.PUBLISHED))
    .orderBy(desc(marketingAttributionRuleVersions.version));
  const latest = latestByLineage(rows).filter((rule) =>
    attributionRuleMatchesLead(rule, lead),
  );
  return (
    latest.sort((left, right) => {
      const exactDifference = Number(Boolean(right.sourceKey)) - Number(Boolean(left.sourceKey));
      if (exactDifference !== 0) return exactDifference;
      return right.version - left.version;
    })[0] ?? null
  );
}

export async function resolveLeadMarketingAttribution(
  tx: MarketingTransaction,
  lead: {
    id: string;
    source: string | null;
    utmContent: string | null;
    createdAt: Date;
  },
  options: {
    matchKind: MarketingAttributionMatchKind;
    attributedById?: string | null;
    overwrite?: boolean;
  },
) {
  if (!lead.utmContent) return null;
  if (!options.overwrite) {
    const [existing] = await tx
      .select({ leadId: leadMarketingAttributions.leadId })
      .from(leadMarketingAttributions)
      .where(eq(leadMarketingAttributions.leadId, lead.id))
      .limit(1);
    if (existing) return null;
  }

  const rule = await matchingPublishedRule(tx, lead);
  if (!rule) return null;
  const [creative] = await tx
    .select()
    .from(marketingCreativeVersions)
    .where(eq(marketingCreativeVersions.id, rule.creativeVersionId))
    .limit(1);
  if (!creative) return null;
  const [campaign] = await tx
    .select()
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.id, creative.campaignId))
    .limit(1);
  if (!campaign) return null;
  const angle = creative.angleId
    ? (
        await tx
          .select()
          .from(marketingAngles)
          .where(eq(marketingAngles.id, creative.angleId))
          .limit(1)
      )[0] ?? null
    : null;

  const attribution = {
    leadId: lead.id,
    ruleVersionId: rule.id,
    creativeVersionId: creative.id,
    campaignId: campaign.id,
    angleId: angle?.id ?? null,
    sourceSnapshot: lead.source,
    utmContentSnapshot: lead.utmContent,
    matchKind: options.matchKind,
    attributedById: options.attributedById ?? null,
    attributedAt: new Date(),
  };
  await tx
    .insert(leadMarketingAttributions)
    .values(attribution)
    .onConflictDoUpdate({
      target: leadMarketingAttributions.leadId,
      set: attribution,
    });

  const resolved = {
    source: lead.source ?? campaign.source,
    campaign: campaign.name,
    ad: creative.name,
    creative: creative.name,
    acquisitionAngle: angle?.name ?? creative.aiAnalysis.angleSuggestion ?? null,
  };
  await tx.update(leads).set(resolved).where(eq(leads.id, lead.id));
  return { ...attribution, ...resolved };
}

export const marketingAttributionService = {
  async overview() {
    const [leadRows, attributionRows, campaignRows, angleRows, creativeRows, ruleRows] =
      await Promise.all([
        db
          .select({
            id: leads.id,
            source: leads.source,
            utmContent: leads.utmContent,
            createdAt: leads.createdAt,
            questions: leads.questions,
            response: leads.response,
            feedback: leads.feedback,
          })
          .from(leads)
          .orderBy(desc(leads.createdAt)),
        db.select().from(leadMarketingAttributions),
        db.select().from(marketingCampaigns).orderBy(asc(marketingCampaigns.name)),
        db.select().from(marketingAngles).orderBy(asc(marketingAngles.name)),
        db.select().from(marketingCreativeVersions),
        db.select().from(marketingAttributionRuleVersions),
      ]);

    const latestCreatives = latestByLineage(creativeRows);
    const latestRules = latestByLineage(ruleRows);
    const campaignsById = new Map(campaignRows.map((row) => [row.id, row]));
    const anglesById = new Map(angleRows.map((row) => [row.id, row]));
    const creativesById = new Map(creativeRows.map((row) => [row.id, row]));
    const attributionsByLead = new Map(attributionRows.map((row) => [row.leadId, row]));
    const leadsWithUtm = leadRows.filter((lead) => Boolean(nonEmpty(lead.utmContent)));
    const unmapped = new Map<
      string,
      {
        source: string | null;
        utmContent: string;
        leadCount: number;
        firstSeenAt: Date;
        lastSeenAt: Date;
      }
    >();
    const campaignMetricRows = new Map<string, {
      id: string; label: string; leads: number; appointments: number; sales: number; noShows: number; notInterested: number;
    }>();
    const creativeMetricRows = new Map<string, {
      id: string; label: string; leads: number; appointments: number; sales: number; noShows: number; notInterested: number;
    }>();
    const angleMetricRows = new Map<string, {
      id: string; label: string; leads: number; appointments: number; sales: number; noShows: number; notInterested: number;
    }>();
    for (const lead of leadsWithUtm) {
      const attribution = attributionsByLead.get(lead.id);
      if (!attribution) {
        const sourceKey = normalizeMarketingKey(lead.source);
        const utmContentKey = normalizeMarketingKey(lead.utmContent);
        const key = `${sourceKey}\u0000${utmContentKey}`;
        const current = unmapped.get(key);
        if (!current) {
          unmapped.set(key, {
            source: lead.source,
            utmContent: lead.utmContent!,
            leadCount: 1,
            firstSeenAt: lead.createdAt,
            lastSeenAt: lead.createdAt,
          });
        } else {
          current.leadCount += 1;
          if (lead.createdAt < current.firstSeenAt) current.firstSeenAt = lead.createdAt;
          if (lead.createdAt > current.lastSeenAt) current.lastSeenAt = lead.createdAt;
        }
        continue;
      }

      const campaign = campaignsById.get(attribution.campaignId);
      const creative = creativesById.get(attribution.creativeVersionId);
      const angle = attribution.angleId ? anglesById.get(attribution.angleId) : null;
      const outcome = leadOutcome(lead);
      if (campaign) addMetric(campaignMetricRows, campaign.id, campaign.name, outcome);
      if (creative) addMetric(creativeMetricRows, creative.lineageKey, creative.name, outcome);
      if (angle) addMetric(angleMetricRows, angle.id, angle.name, outcome);
    }

    const mappings = latestRules
      .map((rule) => {
        const creative = creativesById.get(rule.creativeVersionId);
        const campaign = creative ? campaignsById.get(creative.campaignId) : null;
        const angle = creative?.angleId ? anglesById.get(creative.angleId) : null;
        const attributedLeadCount = attributionRows.filter(
          (row) => row.ruleVersionId === rule.id,
        ).length;
        return creative && campaign
          ? {
              ...rule,
              creative: {
                ...creative,
                assetUrl: creative.assetStorageKey
                  ? `/api/marketing-assets/${creative.assetStorageKey}`
                  : null,
              },
              campaign,
              angle,
              attributedLeadCount,
            }
          : null;
      })
      .filter((mapping): mapping is NonNullable<typeof mapping> => Boolean(mapping))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return {
      coverage: summarizeAttributionCoverage({
        totalLeads: leadRows.length,
        leadsWithUtm: leadsWithUtm.length,
        attributedLeads: leadsWithUtm.filter((lead) => attributionsByLead.has(lead.id)).length,
      }),
      unmappedCodes: [...unmapped.values()].sort(
        (left, right) => right.leadCount - left.leadCount,
      ),
      mappings,
      campaigns: campaignRows,
      angles: angleRows,
      creatives: latestCreatives,
      performance: {
        campaigns: [...campaignMetricRows.values()].map(withRates).sort((a, b) => b.leads - a.leads),
        creatives: [...creativeMetricRows.values()].map(withRates).sort((a, b) => b.leads - a.leads),
        angles: [...angleMetricRows.values()].map(withRates).sort((a, b) => b.leads - a.leads),
      },
    };
  },

  async saveMapping(input: SaveMarketingMappingInput) {
    const utmContentKey = normalizeMarketingKey(input.utmContent);
    const sourceKey = normalizeMarketingKey(input.leadSource);
    if (!utmContentKey) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "El código UTM es obligatorio." });
    }

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`marketing-attribution:${sourceKey}:${utmContentKey}`}))`,
      );
      const campaign = await findOrCreateCampaign(tx, input);
      const angle = await findOrCreateAngle(tx, input);

      const creativeLineageKey = input.creativeLineageKey ?? crypto.randomUUID();
      const previousCreatives = await tx
        .select()
        .from(marketingCreativeVersions)
        .where(eq(marketingCreativeVersions.lineageKey, creativeLineageKey))
        .orderBy(desc(marketingCreativeVersions.version));
      const previousCreative = previousCreatives[0] ?? null;
      const [creative] = await tx
        .insert(marketingCreativeVersions)
        .values({
          id: crypto.randomUUID(),
          lineageKey: creativeLineageKey,
          version: (previousCreative?.version ?? 0) + 1,
          campaignId: campaign.id,
          angleId: angle?.id ?? null,
          status: MARKETING_CREATIVE_STATUS.PUBLISHED,
          name: input.creativeName.trim(),
          format: input.creativeFormat,
          assetStorageKey: input.media?.storageKey ?? previousCreative?.assetStorageKey ?? null,
          assetFileName: input.media?.fileName ?? previousCreative?.assetFileName ?? null,
          assetMimeType: input.media?.mimeType ?? previousCreative?.assetMimeType ?? null,
          assetSizeBytes: input.media?.sizeBytes ?? previousCreative?.assetSizeBytes ?? null,
          assetChecksum: input.media?.checksum ?? previousCreative?.assetChecksum ?? null,
          transcript: nonEmpty(input.transcript),
          hook: nonEmpty(input.hook),
          promise: nonEmpty(input.promise),
          cta: nonEmpty(input.cta),
          targetProfile: nonEmpty(input.targetProfile),
          objections: input.objections ?? [],
          awarenessStage: nonEmpty(input.awarenessStage),
          aiAnalysisStatus: input.aiAnalysis
            ? MARKETING_ANALYSIS_STATUS.APPROVED
            : MARKETING_ANALYSIS_STATUS.NOT_REQUESTED,
          aiAnalysis: input.aiAnalysis ?? {},
          parentVersionId: previousCreative?.id ?? null,
          actorId: input.actorId,
          approvedById: input.actorId,
        })
        .returning();

      const ruleLineageKey = input.ruleLineageKey ?? crypto.randomUUID();
      const allRules = await tx.select().from(marketingAttributionRuleVersions);
      const latestRules = latestByLineage(allRules);
      const conflict = latestRules.find(
        (rule) =>
          rule.lineageKey !== ruleLineageKey &&
          rule.status === MARKETING_RULE_STATUS.PUBLISHED &&
          rule.sourceKey === sourceKey &&
          rule.utmContentKey === utmContentKey &&
          dateWindowsOverlap(rule, {
            validFrom: input.validFrom ?? null,
            validTo: input.validTo ?? null,
          }),
      );
      if (conflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe una relación activa para ese origen, código UTM y periodo.",
        });
      }
      const previousRules = allRules
        .filter((rule) => rule.lineageKey === ruleLineageKey)
        .sort((left, right) => right.version - left.version);
      const previousRule = previousRules[0] ?? null;
      const [rule] = await tx
        .insert(marketingAttributionRuleVersions)
        .values({
          id: crypto.randomUUID(),
          lineageKey: ruleLineageKey,
          version: (previousRule?.version ?? 0) + 1,
          status: MARKETING_RULE_STATUS.PUBLISHED,
          leadSource: nonEmpty(input.leadSource),
          sourceKey,
          utmContent: input.utmContent.trim(),
          utmContentKey,
          creativeVersionId: creative!.id,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
          parentVersionId: previousRule?.id ?? null,
          actorId: input.actorId,
          approvedById: input.actorId,
        })
        .returning();

      const candidates = await tx
        .select({
          id: leads.id,
          source: leads.source,
          utmContent: leads.utmContent,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(isNotNull(leads.utmContent));
      let processed = 0;
      for (const lead of candidates) {
        if (!attributionRuleMatchesLead(rule!, lead)) continue;
        const resolved = await resolveLeadMarketingAttribution(tx, lead, {
          matchKind: MARKETING_ATTRIBUTION_MATCH_KIND.BACKFILL,
          attributedById: input.actorId,
          overwrite: input.reprocessExisting ?? false,
        });
        if (resolved) processed += 1;
      }

      return { rule, creative, campaign, angle, processed };
    });
  },

  async archiveMapping(input: { lineageKey: string; actorId: string }) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`marketing-attribution:${input.lineageKey}`}))`,
      );
      const rows = await tx
        .select()
        .from(marketingAttributionRuleVersions)
        .where(eq(marketingAttributionRuleVersions.lineageKey, input.lineageKey))
        .orderBy(desc(marketingAttributionRuleVersions.version));
      const current = rows[0];
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Relación no encontrada." });
      }
      if (current.status === MARKETING_RULE_STATUS.ARCHIVED) return current;
      const [archived] = await tx
        .insert(marketingAttributionRuleVersions)
        .values({
          ...current,
          id: crypto.randomUUID(),
          version: current.version + 1,
          status: MARKETING_RULE_STATUS.ARCHIVED,
          parentVersionId: current.id,
          actorId: input.actorId,
          approvedById: input.actorId,
          approvedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();
      return archived!;
    });
  },

  async resolvePending(input: { actorId: string }) {
    return db.transaction(async (tx) => {
      const pending = await tx
        .select({
          id: leads.id,
          source: leads.source,
          utmContent: leads.utmContent,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .leftJoin(
          leadMarketingAttributions,
          eq(leadMarketingAttributions.leadId, leads.id),
        )
        .where(
          and(
            isNotNull(leads.utmContent),
            sql`${leadMarketingAttributions.leadId} IS NULL`,
          ),
        );
      let processed = 0;
      for (const lead of pending) {
        const resolved = await resolveLeadMarketingAttribution(tx, lead, {
          matchKind: MARKETING_ATTRIBUTION_MATCH_KIND.BACKFILL,
          attributedById: input.actorId,
        });
        if (resolved) processed += 1;
      }
      return { processed, pendingBefore: pending.length };
    });
  },
};
