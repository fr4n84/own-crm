import type { LeadFinancialEventKind } from "@crm-fran/db/schema/index";

export type FinancialTruthEvent = {
  id: string;
  kind: LeadFinancialEventKind;
  amountCents: number;
  currency: string;
  reversalOfId: string | null;
  occurredAt: Date;
};

export type FinancialTruthByCurrency = {
  currency: string;
  grossContractedCents: number;
  discountsCents: number;
  netContractedCents: number;
  paymentsCents: number;
  refundsAndChargebacksCents: number;
  realizedCashCents: number;
  commissionsCents: number;
  directCostsCents: number;
  realizedMarginBeforeAdsCents: number;
  outstandingContractedBalanceCents: number;
};

export function buildFinancialTruthProjection(
  events: readonly FinancialTruthEvent[],
): FinancialTruthByCurrency[] {
  const reversedIds = new Set(
    events.flatMap((event) =>
      event.kind === "reversal" && event.reversalOfId
        ? [event.reversalOfId]
        : [],
    ),
  );
  const totals = new Map<string, FinancialTruthByCurrency>();

  for (const event of events) {
    if (event.kind === "reversal" || reversedIds.has(event.id)) continue;
    const row = totals.get(event.currency) ?? {
      currency: event.currency,
      grossContractedCents: 0,
      discountsCents: 0,
      netContractedCents: 0,
      paymentsCents: 0,
      refundsAndChargebacksCents: 0,
      realizedCashCents: 0,
      commissionsCents: 0,
      directCostsCents: 0,
      realizedMarginBeforeAdsCents: 0,
      outstandingContractedBalanceCents: 0,
    };
    if (event.kind === "contracted_sale") row.grossContractedCents += event.amountCents;
    if (event.kind === "discount") row.discountsCents += event.amountCents;
    if (event.kind === "payment_received") row.paymentsCents += event.amountCents;
    if (event.kind === "refund" || event.kind === "chargeback") {
      row.refundsAndChargebacksCents += event.amountCents;
    }
    if (event.kind === "commission") row.commissionsCents += event.amountCents;
    if (event.kind === "cost") row.directCostsCents += event.amountCents;
    totals.set(event.currency, row);
  }

  return [...totals.values()]
    .map((row) => {
      const netContractedCents = row.grossContractedCents - row.discountsCents;
      const realizedCashCents = row.paymentsCents - row.refundsAndChargebacksCents;
      return {
        ...row,
        netContractedCents,
        realizedCashCents,
        realizedMarginBeforeAdsCents:
          realizedCashCents - row.commissionsCents - row.directCostsCents,
        outstandingContractedBalanceCents:
          netContractedCents - realizedCashCents,
      };
    })
    .filter((row) =>
      Object.entries(row).some(
        ([key, value]) => key !== "currency" && value !== 0,
      ),
    )
    .sort((left, right) => left.currency.localeCompare(right.currency));
}
