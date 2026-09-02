export type ProfitabilitySpendPeriod = {
  id: string;
  source: string;
  campaign: string;
  periodStart: Date;
  periodEnd: Date;
  spendCents: number;
  referenceSaleValueCents: number;
  currency: string;
};

export type ProfitabilityLead = {
  id: string;
  profile: string | null;
  source: string | null;
  campaign: string | null;
  ad: string | null;
  creative: string | null;
  acquisitionAngle: string | null;
  createdAt: Date;
  callerId: string | null;
  callerName: string | null;
  closerId: string | null;
  closerName: string | null;
  contacted: boolean;
  appointment: boolean;
  show: boolean;
  sale: boolean;
};

type SuggestionAction = "increase" | "maintain" | "reduce" | "wait";

type Totals = {
  spendCents: number;
  estimatedRevenueCents: number;
  leads: number;
  contacted: number;
  appointments: number;
  shows: number;
  sales: number;
};

type Metrics = Totals & {
  estimatedContributionCents: number;
  costPerLeadCents: number | null;
  customerAcquisitionCostCents: number | null;
  roas: number | null;
  leadToSaleRate: number;
  confidence: "low" | "medium" | "high";
  sampleLabel:
    | "Muestra insuficiente"
    | "Muestra orientativa"
    | "Muestra suficiente";
};

type AttributedLead = ProfitabilityLead & {
  allocatedSpendCents: number;
  estimatedRevenueCents: number;
};

type GroupIdentity = { id: string; name: string; context?: string };

const round = (value: number) => Math.round(value * 100) / 100;
const cents = (value: number) => Math.round(value);

function emptyTotals(): Totals {
  return {
    spendCents: 0,
    estimatedRevenueCents: 0,
    leads: 0,
    contacted: 0,
    appointments: 0,
    shows: 0,
    sales: 0,
  };
}

function addLead(totals: Totals, lead: AttributedLead) {
  totals.spendCents += lead.allocatedSpendCents;
  totals.estimatedRevenueCents += lead.estimatedRevenueCents;
  totals.leads += 1;
  totals.contacted += Number(lead.contacted);
  totals.appointments += Number(lead.appointment);
  totals.shows += Number(lead.show);
  totals.sales += Number(lead.sale);
}

function metrics(totals: Totals): Metrics {
  const confidence =
    totals.leads >= 50 ? "high" : totals.leads >= 30 ? "medium" : "low";
  return {
    ...totals,
    spendCents: cents(totals.spendCents),
    estimatedRevenueCents: cents(totals.estimatedRevenueCents),
    estimatedContributionCents: cents(
      totals.estimatedRevenueCents - totals.spendCents,
    ),
    costPerLeadCents:
      totals.leads === 0 ? null : cents(totals.spendCents / totals.leads),
    customerAcquisitionCostCents:
      totals.sales === 0 ? null : cents(totals.spendCents / totals.sales),
    roas:
      totals.spendCents === 0
        ? null
        : round(totals.estimatedRevenueCents / totals.spendCents),
    leadToSaleRate:
      totals.leads === 0 ? 0 : round(totals.sales / totals.leads),
    confidence,
    sampleLabel:
      confidence === "high"
        ? "Muestra suficiente"
        : confidence === "medium"
          ? "Muestra orientativa"
          : "Muestra insuficiente",
  };
}

function suggestion(row: Metrics): {
  action: SuggestionAction;
  suggestedBudgetChangePercent: number;
  reasons: string[];
} {
  if (row.leads < 30) {
    return {
      action: "wait",
      suggestedBudgetChangePercent: 0,
      reasons: [
        `Solo hay ${row.leads} leads atribuidos; se recomiendan al menos 30 antes de mover presupuesto.`,
      ],
    };
  }
  if ((row.roas ?? 0) < 1) {
    return {
      action: "reduce",
      suggestedBudgetChangePercent: -20,
      reasons: [
        `El ROAS estimado es ${row.roas ?? 0}; el ingreso atribuido no cubre el gasto publicitario.`,
      ],
    };
  }
  if ((row.roas ?? 0) >= 1.5 && row.sales >= 3) {
    return {
      action: "increase",
      suggestedBudgetChangePercent: 15,
      reasons: [
        `El ROAS estimado es ${row.roas} con ${row.sales} ventas; se sugiere probar un incremento limitado.`,
      ],
    };
  }
  return {
    action: "maintain",
    suggestedBudgetChangePercent: 0,
    reasons: [
      "La campaña cubre el gasto, pero todavía no ofrece margen estadístico suficiente para escalar.",
    ],
  };
}

function groupedRows(
  leads: readonly AttributedLead[],
  keyFor: (lead: AttributedLead) => GroupIdentity | null,
) {
  const grouped = new Map<string, GroupIdentity & { totals: Totals }>();
  for (const lead of leads) {
    const key = keyFor(lead);
    if (!key) continue;
    const current = grouped.get(key.id) ?? {
      ...key,
      totals: emptyTotals(),
    };
    addLead(current.totals, lead);
    grouped.set(key.id, current);
  }
  return [...grouped.values()]
    .map(({ totals, ...identity }) => ({ ...identity, ...metrics(totals) }))
    .sort(
      (left, right) =>
        right.estimatedContributionCents - left.estimatedContributionCents ||
        left.name.localeCompare(right.name),
    );
}

function attributionIdentity(
  dimension: "ad" | "creative" | "acquisitionAngle",
  value: string | null,
  missingLabel: string,
  lead: AttributedLead,
): GroupIdentity {
  const context = `${lead.source ?? "Sin fuente"} · ${lead.campaign ?? "Sin campaña"}`;
  return {
    id: JSON.stringify([
      dimension,
      lead.source,
      lead.campaign,
      value === null ? { missing: true } : { value },
    ]),
    name: value ?? missingLabel,
    context,
  };
}

function apportionSpendCents(
  spendCents: number,
  leads: readonly ProfitabilityLead[],
) {
  const sorted = [...leads].sort((left, right) => left.id.localeCompare(right.id));
  if (sorted.length === 0) return [];
  const base = Math.floor(spendCents / sorted.length);
  const remainder = spendCents % sorted.length;
  return sorted.map((lead, index) => ({
    lead,
    allocatedSpendCents: base + Number(index < remainder),
  }));
}

export function buildProfitabilityAnalysis(input: {
  from: Date;
  to: Date;
  currency?: string;
  spendPeriods: readonly ProfitabilitySpendPeriod[];
  leads: readonly ProfitabilityLead[];
}) {
  const currency = input.currency ?? input.spendPeriods[0]?.currency ?? "EUR";
  if (input.spendPeriods.some((period) => period.currency !== currency)) {
    throw new Error("Profitability analysis cannot aggregate mixed currency spend periods");
  }
  const attributed: AttributedLead[] = [];
  const campaignTotals = new Map<
    string,
    { source: string; campaign: string; totals: Totals }
  >();

  for (const period of input.spendPeriods) {
    const leads = input.leads.filter(
      (lead) =>
        lead.source === period.source &&
        lead.campaign === period.campaign &&
        lead.createdAt >= period.periodStart &&
        lead.createdAt <= period.periodEnd &&
        lead.createdAt >= input.from &&
        lead.createdAt <= input.to,
    );
    const campaignKey = `${period.source}\u0000${period.campaign}`;
    const campaign = campaignTotals.get(campaignKey) ?? {
      source: period.source,
      campaign: period.campaign,
      totals: emptyTotals(),
    };

    campaign.totals.spendCents += period.spendCents;
    for (const { lead, allocatedSpendCents } of apportionSpendCents(period.spendCents, leads)) {
      const row: AttributedLead = {
        ...lead,
        allocatedSpendCents,
        estimatedRevenueCents: lead.sale
          ? period.referenceSaleValueCents
          : 0,
      };
      attributed.push(row);
      addLead(campaign.totals, row);
      campaign.totals.spendCents -= allocatedSpendCents;
    }
    campaignTotals.set(campaignKey, campaign);
  }

  const campaigns = [...campaignTotals.values()]
    .map(({ totals, ...identity }) => {
      const row = metrics(totals);
      return { ...identity, ...row, suggestion: suggestion(row) };
    })
    .sort(
      (left, right) =>
        right.estimatedContributionCents - left.estimatedContributionCents ||
        left.campaign.localeCompare(right.campaign),
    );

  const summaryTotals = campaigns.reduce<Totals>(
    (total, campaign) => ({
      spendCents: total.spendCents + campaign.spendCents,
      estimatedRevenueCents:
        total.estimatedRevenueCents + campaign.estimatedRevenueCents,
      leads: total.leads + campaign.leads,
      contacted: total.contacted + campaign.contacted,
      appointments: total.appointments + campaign.appointments,
      shows: total.shows + campaign.shows,
      sales: total.sales + campaign.sales,
    }),
    emptyTotals(),
  );

  return {
    currency,
    summary: metrics(summaryTotals),
    campaigns,
    profiles: groupedRows(attributed, (lead) => ({
      id: JSON.stringify([
        "profile",
        lead.profile === null ? { missing: true } : { value: lead.profile },
      ]),
      name: lead.profile ?? "Sin perfil",
    })),
    ads: groupedRows(attributed, (lead) =>
      attributionIdentity("ad", lead.ad, "Sin anuncio", lead),
    ),
    creatives: groupedRows(attributed, (lead) =>
      attributionIdentity("creative", lead.creative, "Sin creatividad", lead),
    ),
    acquisitionAngles: groupedRows(attributed, (lead) =>
      attributionIdentity(
        "acquisitionAngle",
        lead.acquisitionAngle,
        "Sin ángulo de captación",
        lead,
      ),
    ),
    callers: groupedRows(attributed, (lead) =>
      lead.callerId
        ? { id: lead.callerId, name: lead.callerName ?? lead.callerId }
        : null,
    ),
    closers: groupedRows(attributed, (lead) =>
      lead.closerId
        ? { id: lead.closerId, name: lead.closerName ?? lead.closerId }
        : null,
    ),
    attributionModel: "current_single_touch" as const,
    simulationOnly: true as const,
    methodology: `Atribución actual por cohorte en ${currency}: cada lead se agrupa por su atribución vigente, no por un histórico multicanal. El gasto publicitario asignado es una estimación separada del ledger financiero real. Las monedas nunca se agregan ni se convierten. No modifica campañas ni demuestra causalidad.`,
  };
}

export function hasOverlappingSpendPeriod(input: {
  existing: readonly Pick<
    ProfitabilitySpendPeriod,
    "id" | "source" | "campaign" | "periodStart" | "periodEnd"
  >[];
  source: string;
  campaign: string;
  periodStart: Date;
  periodEnd: Date;
  excludeId?: string;
}) {
  return input.existing.some(
    (period) =>
      period.id !== input.excludeId &&
      period.source === input.source &&
      period.campaign === input.campaign &&
      period.periodStart <= input.periodEnd &&
      period.periodEnd >= input.periodStart,
  );
}
