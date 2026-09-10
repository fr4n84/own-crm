import type {
  CloserSaleVoidSnapshot,
  LeadQASession,
  SalePaymentMethod,
} from "@crm-fran/db/schema/index";
import { TRPCError } from "@trpc/server";

import { classifySaleEvidence } from "./domain";

type SaleRecordSnapshotSource = {
  saleAmountCents: number;
  amountPaidCents: number;
  currency: string;
  soldAt: Date;
  paymentMethod: SalePaymentMethod | null;
  financingProvider: string | null;
  installmentMonths: number | null;
};

export type VoidableSaleEvidence = {
  id: string;
  feedback: string;
  questions: LeadQASession;
  mergedIntoLeadId: string | null;
  record: SaleRecordSnapshotSource | null;
};

export type StoredCloserSaleVoid = {
  leadId: string;
  actorId: string;
  reason: string;
  operationId: string;
  snapshot: CloserSaleVoidSnapshot | unknown;
  occurredAt: Date;
};

export interface VoidCloserSaleStore {
  lockSaleEvidence(leadId: string): Promise<VoidableSaleEvidence | null>;
  findByOperationId(operationId: string): Promise<StoredCloserSaleVoid | null>;
  findByLeadId(leadId: string): Promise<StoredCloserSaleVoid | null>;
  listUnreversedFinancialEvents(leadId: string): Promise<Array<{
    id: string;
    amountCents: number;
    currency: string;
  }>>;
  appendReversal(input: {
    leadId: string;
    actorId: string;
    operationId: string;
    originalEventId: string;
    amountCents: number;
    currency: string;
    occurredAt: Date;
  }): Promise<void>;
  supersedeActiveInstallments(input: {
    leadId: string;
    occurredAt: Date;
  }): Promise<void>;
  insertVoid(input: {
    leadId: string;
    actorId: string;
    reason: string;
    operationId: string;
    snapshot: CloserSaleVoidSnapshot;
    occurredAt: Date;
  }): Promise<StoredCloserSaleVoid>;
}

export type VoidCloserSaleInput = {
  leadId: string;
  actorId: string;
  reason: string;
  operationId: string;
};

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

function sameOperation(
  stored: StoredCloserSaleVoid,
  input: VoidCloserSaleInput,
  reason: string,
) {
  return stored.leadId === input.leadId
    && stored.actorId === input.actorId
    && stored.reason === reason;
}

export async function executeVoidCloserSale(
  store: VoidCloserSaleStore,
  input: VoidCloserSaleInput,
  clock: () => Date = () => new Date(),
) {
  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > 1_000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El motivo de la anulación debe tener entre 1 y 1000 caracteres.",
    });
  }

  const sale = await store.lockSaleEvidence(input.leadId);
  const evidence = sale && sale.mergedIntoLeadId === null
    ? classifySaleEvidence(sale)
    : null;
  if (!sale || !evidence) {
    throw new TRPCError({ code: "NOT_FOUND", message: "La venta no existe" });
  }

  const operationVoid = await store.findByOperationId(input.operationId);
  if (operationVoid) {
    if (!sameOperation(operationVoid, input, reason)) {
      conflict("El identificador de operación ya se utilizó con otros datos.");
    }
    return { ...operationVoid, idempotent: true as const };
  }

  if (await store.findByLeadId(input.leadId)) {
    conflict("La venta ya está anulada.");
  }

  const occurredAt = clock();
  const snapshot: CloserSaleVoidSnapshot = {
    evidence,
    saleAmountCents: sale.record?.saleAmountCents ?? null,
    amountPaidCents: sale.record?.amountPaidCents ?? null,
    currency: sale.record?.currency ?? null,
    soldAt: sale.record?.soldAt.toISOString() ?? null,
    paymentMethod: sale.record?.paymentMethod ?? null,
    financingProvider: sale.record?.financingProvider ?? null,
    installmentMonths: sale.record?.installmentMonths ?? null,
  };

  const events = await store.listUnreversedFinancialEvents(input.leadId);
  for (const event of events) {
    await store.appendReversal({
      leadId: input.leadId,
      actorId: input.actorId,
      operationId: input.operationId,
      originalEventId: event.id,
      amountCents: event.amountCents,
      currency: event.currency,
      occurredAt,
    });
  }
  await store.supersedeActiveInstallments({
    leadId: input.leadId,
    occurredAt,
  });
  const stored = await store.insertVoid({
    leadId: input.leadId,
    actorId: input.actorId,
    reason,
    operationId: input.operationId,
    snapshot,
    occurredAt,
  });

  return { ...stored, idempotent: false as const };
}
