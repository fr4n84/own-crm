export type AttributionRuleMatch = {
  sourceKey: string;
  utmContentKey: string;
  validFrom: Date | null;
  validTo: Date | null;
};

export type AttributableLead = {
  source: string | null;
  utmContent: string | null;
  createdAt: Date;
};

export function normalizeMarketingKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

export function attributionRuleMatchesLead(
  rule: AttributionRuleMatch,
  lead: AttributableLead,
) {
  const leadSourceKey = normalizeMarketingKey(lead.source);
  const sourceMatches =
    rule.sourceKey === leadSourceKey || rule.sourceKey.length === 0;

  return (
    sourceMatches &&
    rule.utmContentKey === normalizeMarketingKey(lead.utmContent) &&
    (!rule.validFrom || lead.createdAt >= rule.validFrom) &&
    (!rule.validTo || lead.createdAt <= rule.validTo)
  );
}

export function summarizeAttributionCoverage(input: {
  totalLeads: number;
  leadsWithUtm: number;
  attributedLeads: number;
}) {
  const attributedLeads = Math.min(input.attributedLeads, input.leadsWithUtm);
  return {
    ...input,
    attributedLeads,
    unmappedLeads: Math.max(0, input.leadsWithUtm - attributedLeads),
    coveragePercent:
      input.leadsWithUtm === 0
        ? 0
        : Math.round((attributedLeads / input.leadsWithUtm) * 10_000) / 100,
  };
}

export function dateWindowsOverlap(
  left: { validFrom: Date | null; validTo: Date | null },
  right: { validFrom: Date | null; validTo: Date | null },
) {
  const leftStart = left.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const leftEnd = left.validTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightStart = right.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightEnd = right.validTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}
