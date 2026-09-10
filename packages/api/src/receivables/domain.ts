export type InstallmentPlanItem = { sequence: number; dueOn: string; expectedCents: number };
export type ReceivableInstallment = InstallmentPlanItem & { id: string };
export type PaymentAllocation = { installmentId: string; paymentEventId: string; amountCents: number };

function monthlyDate(firstDueOn: string, offset: number) {
  const [year, month, day] = firstDueOn.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid first due date");
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), Math.min(day, lastDay)));
  return date.toISOString().slice(0, 10);
}

export function buildInstallmentSchedule(input: { totalCents: number; installments: number; firstDueOn: string }) {
  if (!Number.isSafeInteger(input.totalCents) || input.totalCents <= 0) throw new Error("Invalid contracted amount");
  if (!Number.isSafeInteger(input.installments) || input.installments < 1 || input.installments > 600) throw new Error("Invalid installment count");
  const base = Math.floor(input.totalCents / input.installments);
  const remainder = input.totalCents % input.installments;
  return Array.from({ length: input.installments }, (_, index): InstallmentPlanItem => ({
    sequence: index + 1,
    dueOn: monthlyDate(input.firstDueOn, index),
    expectedCents: base + (index < remainder ? 1 : 0),
  }));
}

export function allocatePaymentOldestFirst(input: {
  paymentEventId: string;
  amountCents: number;
  installments: readonly ReceivableInstallment[];
  alreadyAllocatedCents: ReadonlyMap<string, number>;
}) {
  let remaining = input.amountCents;
  const allocations: PaymentAllocation[] = [];
  for (const installment of [...input.installments].sort((a, b) => a.sequence - b.sequence)) {
    const available = installment.expectedCents - (input.alreadyAllocatedCents.get(installment.id) ?? 0);
    const amountCents = Math.min(Math.max(available, 0), remaining);
    if (amountCents > 0) allocations.push({ installmentId: installment.id, paymentEventId: input.paymentEventId, amountCents });
    remaining -= amountCents;
    if (remaining === 0) break;
  }
  if (remaining !== 0) throw new Error("Payment exceeds receivable outstanding amount");
  return allocations;
}

export function deriveReceivableState(input: {
  asOf: string;
  installments: readonly ReceivableInstallment[];
  allocations: readonly PaymentAllocation[];
  reversedPaymentEventIds: ReadonlySet<string>;
}) {
  const effective = input.allocations.filter((item) => !input.reversedPaymentEventIds.has(item.paymentEventId));
  const paidByInstallment = new Map<string, number>();
  for (const allocation of effective) paidByInstallment.set(allocation.installmentId, (paidByInstallment.get(allocation.installmentId) ?? 0) + allocation.amountCents);
  const installments = [...input.installments].sort((a, b) => a.sequence - b.sequence).map((item) => {
    const paidCents = Math.min(paidByInstallment.get(item.id) ?? 0, item.expectedCents);
    const outstandingCents = item.expectedCents - paidCents;
    const status = outstandingCents === 0 ? "paid" as const : paidCents > 0 ? "partial" as const : "pending" as const;
    return { ...item, paidCents, outstandingCents, status };
  });
  const contractedCents = installments.reduce((sum, item) => sum + item.expectedCents, 0);
  const collectedCents = installments.reduce((sum, item) => sum + item.paidCents, 0);
  const open = installments.filter((item) => item.outstandingCents > 0);
  return {
    contractedCents,
    collectedCents,
    outstandingCents: contractedCents - collectedCents,
    overdueCents: open.filter((item) => item.dueOn < input.asOf).reduce((sum, item) => sum + item.outstandingCents, 0),
    nextDueOn: open[0]?.dueOn ?? null,
    installments,
  };
}
