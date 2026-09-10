import { and, db, eq, inArray, isNull } from "@crm-fran/db";
import {
  leadFinancialEvents,
  receivableAccounts,
  receivableInstallments,
  receivablePaymentAllocations,
} from "@crm-fran/db/schema/index";
import { allocatePaymentOldestFirst, buildInstallmentSchedule, deriveReceivableState } from "./domain";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function madridDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function syncReceivableAccount(tx: Transaction, input: {
  leadId: string;
  actorId: string;
  contractedAmountCents: number;
  amountPaidCents: number;
  currency: string;
  soldAt: Date;
  installmentCount: number;
  paymentEventId: string | null;
}) {
  const [current] = await tx.select().from(receivableAccounts).where(eq(receivableAccounts.leadId, input.leadId)).limit(1);
  const activeInstallments = current
    ? await tx.select().from(receivableInstallments).where(and(eq(receivableInstallments.leadId, input.leadId), eq(receivableInstallments.scheduleVersion, current.activeScheduleVersion), isNull(receivableInstallments.supersededAt)))
    : [];
  const scheduleChanged = !current
    || current.contractedAmountCents !== input.contractedAmountCents
    || current.currency !== input.currency
    || activeInstallments.length !== input.installmentCount;
  const scheduleVersion = scheduleChanged ? (current?.activeScheduleVersion ?? 0) + 1 : current.activeScheduleVersion;
  let scheduleRows = activeInstallments;
  if (scheduleChanged) {
    if (current) await tx.update(receivableInstallments).set({ supersededAt: new Date() }).where(and(eq(receivableInstallments.leadId, input.leadId), isNull(receivableInstallments.supersededAt)));
    await tx.insert(receivableAccounts).values({
      leadId: input.leadId,
      currency: input.currency,
      contractedAmountCents: input.contractedAmountCents,
      activeScheduleVersion: scheduleVersion,
      updatedById: input.actorId,
    }).onConflictDoUpdate({ target: receivableAccounts.leadId, set: {
      currency: input.currency,
      contractedAmountCents: input.contractedAmountCents,
      activeScheduleVersion: scheduleVersion,
      updatedById: input.actorId,
      updatedAt: new Date(),
    }});
    const plan = buildInstallmentSchedule({
      totalCents: input.contractedAmountCents,
      installments: input.installmentCount,
      firstDueOn: input.soldAt.toISOString().slice(0, 10),
    });
    scheduleRows = plan.map((item) => ({
      id: crypto.randomUUID(),
      leadId: input.leadId,
      scheduleVersion,
      sequence: item.sequence,
      dueOn: item.dueOn,
      expectedAmountCents: item.expectedCents,
      supersededAt: null,
      createdAt: new Date(),
    }));
    await tx.insert(receivableInstallments).values(scheduleRows);
  }
  if (input.paymentEventId && input.amountPaidCents > 0) {
    const installmentIds = scheduleRows.map((item) => item.id);
    const existing = installmentIds.length === 0 ? [] : await tx
      .select({ installmentId: receivablePaymentAllocations.installmentId, paymentEventId: receivablePaymentAllocations.financialEventId, amountCents: receivablePaymentAllocations.amountCents })
      .from(receivablePaymentAllocations)
      .where(inArray(receivablePaymentAllocations.installmentId, installmentIds));
    const eventIds = existing.map((item) => item.paymentEventId);
    const reversals = eventIds.length === 0 ? [] : await tx.select({ reversalOfId: leadFinancialEvents.reversalOfId }).from(leadFinancialEvents).where(inArray(leadFinancialEvents.reversalOfId, eventIds));
    const reversed = new Set(reversals.flatMap((item) => item.reversalOfId ? [item.reversalOfId] : []));
    const paid = new Map<string, number>();
    for (const allocation of existing) if (!reversed.has(allocation.paymentEventId)) paid.set(allocation.installmentId, (paid.get(allocation.installmentId) ?? 0) + allocation.amountCents);
    const allocations = allocatePaymentOldestFirst({
      paymentEventId: input.paymentEventId,
      amountCents: input.amountPaidCents,
      installments: scheduleRows.map((item) => ({ id: item.id, sequence: item.sequence, dueOn: item.dueOn, expectedCents: item.expectedAmountCents })),
      alreadyAllocatedCents: paid,
    });
    if (allocations.length > 0) await tx.insert(receivablePaymentAllocations).values(allocations.map((item) => ({ id: crypto.randomUUID(), installmentId: item.installmentId, financialEventId: item.paymentEventId, amountCents: item.amountCents }))).onConflictDoNothing();
  }
}

export async function listReceivableSummaries() {
  const [accounts, installments, allocations, reversals] = await Promise.all([
    db.select().from(receivableAccounts),
    db.select().from(receivableInstallments).where(isNull(receivableInstallments.supersededAt)),
    db.select({ installmentId: receivablePaymentAllocations.installmentId, paymentEventId: receivablePaymentAllocations.financialEventId, amountCents: receivablePaymentAllocations.amountCents }).from(receivablePaymentAllocations),
    db.select({ reversalOfId: leadFinancialEvents.reversalOfId }).from(leadFinancialEvents).where(eq(leadFinancialEvents.kind, "reversal")),
  ]);
  const reversed = new Set(reversals.flatMap((item) => item.reversalOfId ? [item.reversalOfId] : []));
  const installmentLead = new Map(installments.map((item) => [item.id, item.leadId]));
  return new Map(accounts.map((account) => {
    const ownInstallments = installments.filter((item) => item.leadId === account.leadId && item.scheduleVersion === account.activeScheduleVersion);
    return [account.leadId, {
      currency: account.currency,
      ...deriveReceivableState({
        asOf: madridDay(),
        installments: ownInstallments.map((item) => ({ id: item.id, sequence: item.sequence, dueOn: item.dueOn, expectedCents: item.expectedAmountCents })),
        allocations: allocations.filter((item) => installmentLead.get(item.installmentId) === account.leadId),
        reversedPaymentEventIds: reversed,
      }),
    }];
  }));
}
