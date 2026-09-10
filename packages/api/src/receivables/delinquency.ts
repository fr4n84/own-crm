import { deriveReceivableState, type PaymentAllocation, type ReceivableInstallment } from "./domain";

export type DelinquencySale = {
  leadId: string;
  leadName: string;
  closer: { id: string | null; name: string | null };
  currency: string;
  contractedCents: number;
  installments: readonly ReceivableInstallment[];
};

export type CollectionActivity = {
  installmentId: string;
  kind:
    | "collection_reviewed"
    | "collection_contact_recorded"
    | "collection_next_action_scheduled";
  occurredAt: Date;
  note: string | null;
  scheduledFor: string | null;
};

export type DelinquencyExclusions = {
  legacyIncompleteSalesCount: number;
  unconfiguredSalesCount: number;
  voidedSalesCount: number;
};

function basisPoints(numerator: number, denominator: number) {
  return denominator === 0 ? null : Math.round(numerator * 10_000 / denominator);
}

function calendarDaysBetween(from: string, to: string) {
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function latestActivity(
  activities: readonly CollectionActivity[],
  kind: CollectionActivity["kind"],
) {
  return activities
    .filter((activity) => activity.kind === kind)
    .sort((first, second) => second.occurredAt.getTime() - first.occurredAt.getTime())[0] ?? null;
}

export function buildDelinquencyReport(input: {
  asOf: string;
  sales: readonly DelinquencySale[];
  allocations: readonly PaymentAllocation[];
  reversedPaymentEventIds: ReadonlySet<string>;
  collectionActivities: readonly CollectionActivity[];
  exclusions: DelinquencyExclusions;
}) {
  const states = input.sales.map((sale) => ({
    sale,
    state: deriveReceivableState({
      asOf: input.asOf,
      installments: sale.installments,
      allocations: input.allocations.filter((allocation) =>
        sale.installments.some((installment) => installment.id === allocation.installmentId)),
      reversedPaymentEventIds: input.reversedPaymentEventIds,
    }),
  }));

  const currencies = [...new Set(input.sales.map((sale) => sale.currency))].sort();
  const metrics = currencies.map((currency) => {
    const own = states.filter(({ sale }) => sale.currency === currency);
    const configuredSalesCount = own.length;
    const delinquentSalesCount = own.filter(({ state }) => state.overdueCents > 0).length;
    const contractedCents = own.reduce((sum, { sale }) => sum + sale.contractedCents, 0);
    const collectedCents = own.reduce((sum, { state }) => sum + state.collectedCents, 0);
    const overdueCents = own.reduce((sum, { state }) => sum + state.overdueCents, 0);
    return {
      currency,
      configuredSalesCount,
      delinquentSalesCount,
      delinquentSalesBps: basisPoints(delinquentSalesCount, configuredSalesCount) ?? 0,
      overdueCents,
      contractedCents,
      collectedCents,
      overdueVsContractedBps: basisPoints(overdueCents, contractedCents) ?? 0,
      overdueVsCollectedBps: basisPoints(overdueCents, collectedCents),
    };
  });

  const rows = states.flatMap(({ sale, state }) =>
    state.installments.flatMap((installment) => {
      if (installment.dueOn >= input.asOf || installment.outstandingCents === 0) return [];
      const activities = input.collectionActivities.filter(
        (activity) => activity.installmentId === installment.id,
      );
      const lastContact = latestActivity(activities, "collection_contact_recorded");
      const nextAction = latestActivity(activities, "collection_next_action_scheduled");
      const lastReview = latestActivity(activities, "collection_reviewed");
      const operationalStatus = nextAction
        ? nextAction.scheduledFor && nextAction.scheduledFor < input.asOf
          ? "next_action_due" as const
          : "next_action_scheduled" as const
        : lastContact
          ? "contact_recorded" as const
          : lastReview
            ? "reviewed" as const
            : "uncontacted" as const;
      return [{
        installmentId: installment.id,
        lead: { id: sale.leadId, name: sale.leadName },
        currency: sale.currency,
        sequence: installment.sequence,
        totalInstallments: sale.installments.length,
        dueOn: installment.dueOn,
        daysOverdue: calendarDaysBetween(installment.dueOn, input.asOf),
        expectedCents: installment.expectedCents,
        paidCents: installment.paidCents,
        pendingCents: installment.outstandingCents,
        closer: sale.closer,
        lastCollectionContact: lastContact
          ? { occurredAt: lastContact.occurredAt, note: lastContact.note }
          : null,
        nextAction: nextAction?.scheduledFor
          ? { scheduledFor: nextAction.scheduledFor, note: nextAction.note }
          : null,
        financialStatus: installment.paidCents > 0
          ? "overdue_partial" as const
          : "overdue_unpaid" as const,
        operationalStatus,
      }];
    }),
  ).sort((first, second) =>
    first.currency.localeCompare(second.currency)
    || first.dueOn.localeCompare(second.dueOn)
    || first.lead.name.localeCompare(second.lead.name)
    || first.sequence - second.sequence);

  return {
    asOf: input.asOf,
    metrics,
    rows,
    exclusions: input.exclusions,
  };
}
