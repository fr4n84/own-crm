import { alias, and, db, eq, isNull, sql } from "@crm-fran/db";
import {
  closerSaleRecords,
  closerSaleVoids,
  leadFinancialEvents,
  leads,
  receivableInstallments,
  user,
} from "@crm-fran/db/schema/index";
import { TRPCError } from "@trpc/server";

import { classifySaleEvidence } from "./domain";
import { buildSaleFinancialPlan } from "./financial-plan";
import { executeVoidCloserSale, type VoidCloserSaleStore } from "./void-sale";
import { listReceivableSummaries, syncReceivableAccount } from "../receivables/service";

export type ContractFileInput = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};

export async function listCloserSales() {
  const caller = alias(user, "closer_sales_caller");
  const closer = alias(user, "closer_sales_closer");
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      campaign: leads.campaign,
      feedback: leads.feedback,
      questions: leads.questions,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      caller: { id: caller.id, name: caller.name },
      closer: { id: closer.id, name: closer.name },
      record: {
        contractStorageKey: closerSaleRecords.contractStorageKey,
        contractFileName: closerSaleRecords.contractFileName,
        contractMimeType: closerSaleRecords.contractMimeType,
        contractSizeBytes: closerSaleRecords.contractSizeBytes,
        contractChecksum: closerSaleRecords.contractChecksum,
        salesCallUrl: closerSaleRecords.salesCallUrl,
        saleAmountCents: closerSaleRecords.saleAmountCents,
        amountPaidCents: closerSaleRecords.amountPaidCents,
        currency: closerSaleRecords.currency,
        soldAt: closerSaleRecords.soldAt,
        paymentMethod: closerSaleRecords.paymentMethod,
        financingProvider: closerSaleRecords.financingProvider,
        installmentMonths: closerSaleRecords.installmentMonths,
        onboardingCompleted: closerSaleRecords.onboardingCompleted,
        onboardingCompletedAt: closerSaleRecords.onboardingCompletedAt,
        onboardingVideoUrl: closerSaleRecords.onboardingVideoUrl,
        updatedAt: closerSaleRecords.updatedAt,
      },
    })
    .from(leads)
    .leftJoin(caller, eq(caller.id, leads.callerId))
    .leftJoin(closer, eq(closer.id, leads.closerId))
    .leftJoin(closerSaleRecords, eq(closerSaleRecords.leadId, leads.id))
    .leftJoin(closerSaleVoids, eq(closerSaleVoids.leadId, leads.id))
    .where(and(
      isNull(leads.mergedIntoLeadId),
      isNull(closerSaleVoids.leadId),
    ));

  const receivables = await listReceivableSummaries();
  return rows.flatMap((row) => {
    const evidence = classifySaleEvidence(row);
    if (!evidence) return [];
    const record = row.record;
    const hasRecord = record !== null && record.updatedAt !== null;
    return [{
      ...row,
      saleEvidence: evidence,
      receivable: receivables.get(row.id) ?? null,
      record: hasRecord
        ? {
            ...record,
            contractUrl: record.contractStorageKey
              ? `/api/closer-sales/contracts/${record.contractStorageKey}`
              : null,
          }
        : null,
    }];
  }).sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime());
}

export async function updateCloserSaleRecord(input: {
  leadId: string;
  actorId: string;
  contract?: ContractFileInput | null;
  salesCallUrl: string | null;
  saleAmountCents: number;
  amountPaidCents: number;
  currency: string;
  soldAt: Date;
  paymentMethod: "fullpay" | "financed" | null;
  financingProvider: string | null;
  installmentMonths: number | null;
  financialOperationId: string;
  onboardingCompleted: boolean;
  onboardingVideoUrl: string | null;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from leads where id = ${input.leadId} for update`);
    const [lead] = await tx
      .select({ id: leads.id, feedback: leads.feedback, questions: leads.questions, mergedIntoLeadId: leads.mergedIntoLeadId })
      .from(leads)
      .where(eq(leads.id, input.leadId))
      .limit(1);
    if (!lead || lead.mergedIntoLeadId !== null || !classifySaleEvidence(lead)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "La venta no existe" });
    }
    const [voided] = await tx
      .select({ leadId: closerSaleVoids.leadId })
      .from(closerSaleVoids)
      .where(eq(closerSaleVoids.leadId, input.leadId))
      .limit(1);
    if (voided) {
      throw new TRPCError({ code: "CONFLICT", message: "La venta está anulada." });
    }
    const [current] = await tx
      .select()
      .from(closerSaleRecords)
      .where(eq(closerSaleRecords.leadId, input.leadId))
      .limit(1);
    if (current?.lastFinancialOperationId === input.financialOperationId) {
      return current;
    }
    const contract = input.contract === undefined
      ? current?.contractStorageKey
        ? {
            storageKey: current.contractStorageKey,
            fileName: current.contractFileName!,
            mimeType: current.contractMimeType!,
            sizeBytes: current.contractSizeBytes!,
            checksum: current.contractChecksum!,
          }
        : null
      : input.contract;
    const now = new Date();
    const financialPlan = buildSaleFinancialPlan(
      current
        ? {
            saleAmountCents: current.saleAmountCents,
            amountPaidCents: current.amountPaidCents,
            currency: current.currency,
            soldAt: current.soldAt,
            contractedSaleEventId: current.contractedSaleEventId,
            paymentReceivedEventId: current.paymentReceivedEventId,
          }
        : null,
      input,
    );
    const reverseFinancialEvent = async (eventId: string, suffix: string) => {
      const [original] = await tx
        .select()
        .from(leadFinancialEvents)
        .where(eq(leadFinancialEvents.id, eventId))
        .limit(1);
      if (!original || original.leadId !== input.leadId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "No se pudo verificar el hecho financiero anterior de la venta.",
        });
      }
      await tx.insert(leadFinancialEvents).values({
        id: crypto.randomUUID(),
        leadId: input.leadId,
        kind: "reversal",
        amountCents: original.amountCents,
        currency: original.currency,
        occurredAt: now,
        createdById: input.actorId,
        idempotencyKey: `closer-sale:${input.financialOperationId}:reverse-${suffix}`,
        note: "Corrección auditada desde Ventas closer",
        externalReference: `closer-sale:${input.leadId}`,
        reversalOfId: original.id,
      });
    };
    if (financialPlan.reversePaymentReceivedEventId) {
      await reverseFinancialEvent(financialPlan.reversePaymentReceivedEventId, "payment");
    }
    if (financialPlan.reverseContractedSaleEventId) {
      await reverseFinancialEvent(financialPlan.reverseContractedSaleEventId, "contracted");
    }
    let contractedSaleEventId = current?.contractedSaleEventId ?? null;
    if (financialPlan.createContractedSale) {
      contractedSaleEventId = crypto.randomUUID();
      await tx.insert(leadFinancialEvents).values({
        id: contractedSaleEventId,
        leadId: input.leadId,
        kind: "contracted_sale",
        amountCents: input.saleAmountCents,
        currency: input.currency,
        occurredAt: current ? now : input.soldAt,
        createdById: input.actorId,
        idempotencyKey: `closer-sale:${input.financialOperationId}:contracted`,
        note: "Venta contratada registrada desde Ventas closer",
        externalReference: `closer-sale:${input.leadId}`,
      });
    }
    if (!contractedSaleEventId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar la venta contratada." });
    }
    let paymentReceivedEventId = financialPlan.reversePaymentReceivedEventId
      ? null
      : current?.paymentReceivedEventId ?? null;
    if (financialPlan.createPaymentReceived) {
      paymentReceivedEventId = crypto.randomUUID();
      await tx.insert(leadFinancialEvents).values({
        id: paymentReceivedEventId,
        leadId: input.leadId,
        kind: "payment_received",
        amountCents: input.amountPaidCents,
        currency: input.currency,
        occurredAt: now,
        createdById: input.actorId,
        idempotencyKey: `closer-sale:${input.financialOperationId}:payment`,
        note: "Cobro registrado desde Ventas closer",
        externalReference: `closer-sale:${input.leadId}`,
      });
    }
    const values = {
      leadId: input.leadId,
      contractStorageKey: contract?.storageKey ?? null,
      contractFileName: contract?.fileName ?? null,
      contractMimeType: contract?.mimeType ?? null,
      contractSizeBytes: contract?.sizeBytes ?? null,
      contractChecksum: contract?.checksum ?? null,
      salesCallUrl: input.salesCallUrl,
      saleAmountCents: input.saleAmountCents,
      amountPaidCents: input.amountPaidCents,
      currency: input.currency,
      soldAt: input.soldAt,
      paymentMethod: input.paymentMethod,
      financingProvider: input.financingProvider,
      installmentMonths: input.installmentMonths,
      contractedSaleEventId,
      paymentReceivedEventId,
      lastFinancialOperationId: input.financialOperationId,
      onboardingCompleted: input.onboardingCompleted,
      onboardingCompletedAt: input.onboardingCompleted
        ? current?.onboardingCompletedAt ?? now
        : null,
      onboardingVideoUrl: input.onboardingVideoUrl,
      updatedById: input.actorId,
      updatedAt: now,
    };
    const [record] = await tx
      .insert(closerSaleRecords)
      .values(values)
      .onConflictDoUpdate({
        target: closerSaleRecords.leadId,
        set: values,
      })
      .returning();
    await syncReceivableAccount(tx, {
      leadId: input.leadId,
      actorId: input.actorId,
      contractedAmountCents: input.saleAmountCents,
      amountPaidCents: input.amountPaidCents,
      currency: input.currency,
      soldAt: input.soldAt,
      installmentCount: input.paymentMethod === "financed" ? input.installmentMonths ?? 1 : 1,
      paymentEventId: paymentReceivedEventId,
    });
    return record!;
  });
}

export async function voidCloserSale(input: {
  leadId: string;
  actorId: string;
  reason: string;
  operationId: string;
}) {
  return db.transaction(async (tx) => {
    const store: VoidCloserSaleStore = {
      async lockSaleEvidence(leadId) {
        const [lead] = await tx
          .select({
            id: leads.id,
            feedback: leads.feedback,
            questions: leads.questions,
            mergedIntoLeadId: leads.mergedIntoLeadId,
          })
          .from(leads)
          .where(eq(leads.id, leadId))
          .limit(1)
          .for("update");
        if (!lead) return null;

        const [record] = await tx
          .select({
            saleAmountCents: closerSaleRecords.saleAmountCents,
            amountPaidCents: closerSaleRecords.amountPaidCents,
            currency: closerSaleRecords.currency,
            soldAt: closerSaleRecords.soldAt,
            paymentMethod: closerSaleRecords.paymentMethod,
            financingProvider: closerSaleRecords.financingProvider,
            installmentMonths: closerSaleRecords.installmentMonths,
          })
          .from(closerSaleRecords)
          .where(eq(closerSaleRecords.leadId, leadId))
          .limit(1)
          .for("update");

        return { ...lead, record: record ?? null };
      },
      async findByOperationId(operationId) {
        const [stored] = await tx
          .select()
          .from(closerSaleVoids)
          .where(eq(closerSaleVoids.operationId, operationId))
          .limit(1);
        return stored ?? null;
      },
      async findByLeadId(leadId) {
        const [stored] = await tx
          .select()
          .from(closerSaleVoids)
          .where(eq(closerSaleVoids.leadId, leadId))
          .limit(1);
        return stored ?? null;
      },
      async listUnreversedFinancialEvents(leadId) {
        const events = await tx
          .select({
            id: leadFinancialEvents.id,
            kind: leadFinancialEvents.kind,
            amountCents: leadFinancialEvents.amountCents,
            currency: leadFinancialEvents.currency,
            reversalOfId: leadFinancialEvents.reversalOfId,
          })
          .from(leadFinancialEvents)
          .where(eq(leadFinancialEvents.leadId, leadId));
        const reversedIds = new Set(
          events.flatMap((event) => event.reversalOfId ? [event.reversalOfId] : []),
        );
        return events
          .filter((event) => event.kind !== "reversal" && !reversedIds.has(event.id))
          .map(({ id, amountCents, currency }) => ({ id, amountCents, currency }));
      },
      async appendReversal(event) {
        await tx.insert(leadFinancialEvents).values({
          id: crypto.randomUUID(),
          leadId: event.leadId,
          kind: "reversal",
          amountCents: event.amountCents,
          currency: event.currency,
          occurredAt: event.occurredAt,
          createdById: event.actorId,
          idempotencyKey: "closer-sale-void:" + event.operationId + ":reverse:" + event.originalEventId,
          note: "Anulación auditada desde Ventas closer",
          externalReference: "closer-sale:" + event.leadId,
          reversalOfId: event.originalEventId,
        });
      },
      async supersedeActiveInstallments({ leadId, occurredAt }) {
        await tx
          .update(receivableInstallments)
          .set({ supersededAt: occurredAt })
          .where(and(
            eq(receivableInstallments.leadId, leadId),
            isNull(receivableInstallments.supersededAt),
          ));
      },
      async insertVoid(values) {
        const [stored] = await tx
          .insert(closerSaleVoids)
          .values(values)
          .returning();
        if (!stored) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No se pudo registrar la anulación.",
          });
        }
        return stored;
      },
    };

    return executeVoidCloserSale(store, input);
  });
}
