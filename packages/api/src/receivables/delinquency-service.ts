import { TRPCError } from "@trpc/server";
import { alias, and, db, eq, inArray, isNull } from "@crm-fran/db";
import {
  closerSaleRecords,
  closerSaleVoids,
  leadActivityEvents,
  leadFinancialEvents,
  leads,
  receivableAccounts,
  receivableInstallments,
  receivablePaymentAllocations,
  user,
} from "@crm-fran/db/schema/index";
import { z } from "zod/v4";

import { classifySaleEvidence } from "../closer-sales/domain";
import {
  executeRecordCollectionFollowUp,
  type CollectionFollowUpStore,
  type RecordCollectionFollowUpInput,
} from "./collection-follow-up";
import {
  buildDelinquencyReport,
  type CollectionActivity,
  type DelinquencySale,
} from "./delinquency";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reviewedMetadata = z.object({ schemaVersion: z.literal(1) }).strict();
const contactMetadata = z.object({
  schemaVersion: z.literal(1),
  channel: z.literal("unspecified"),
}).strict();
const nextActionMetadata = z.object({
  schemaVersion: z.literal(1),
  scheduledFor: calendarDay,
}).strict();
const boundedNote = z.string().min(1).max(1_000);
const collectionKinds = [
  "collection_reviewed",
  "collection_contact_recorded",
  "collection_next_action_scheduled",
] as const;

function madridDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseCollectionActivity(row: {
  installmentId: string | null;
  kind: string;
  occurredAt: Date;
  description: string | null;
  metadata: Record<string, unknown>;
}): CollectionActivity | null {
  if (!row.installmentId) return null;
  if (row.kind === "collection_reviewed") {
    if (!reviewedMetadata.safeParse(row.metadata).success) return null;
    return {
      installmentId: row.installmentId,
      kind: row.kind,
      occurredAt: row.occurredAt,
      note: null,
      scheduledFor: null,
    };
  }
  if (row.kind === "collection_contact_recorded") {
    if (
      !contactMetadata.safeParse(row.metadata).success
      || !boundedNote.safeParse(row.description).success
    ) return null;
    return {
      installmentId: row.installmentId,
      kind: row.kind,
      occurredAt: row.occurredAt,
      note: row.description,
      scheduledFor: null,
    };
  }
  if (row.kind === "collection_next_action_scheduled") {
    const metadata = nextActionMetadata.safeParse(row.metadata);
    if (!metadata.success || !boundedNote.safeParse(row.description).success) return null;
    return {
      installmentId: row.installmentId,
      kind: row.kind,
      occurredAt: row.occurredAt,
      note: row.description,
      scheduledFor: metadata.data.scheduledFor,
    };
  }
  return null;
}

export async function listDelinquencies(input: {
  actorId: string;
  canReadAll: boolean;
}) {
  const asOf = madridDay();
  return db.transaction(async (tx) => {
    const closer = alias(user, "delinquency_closer");
    const leadRows = await tx.select({
      leadId: leads.id,
      leadName: leads.name,
      closerId: leads.closerId,
      closerName: closer.name,
      feedback: leads.feedback,
      questions: leads.questions,
      saleRecordLeadId: closerSaleRecords.leadId,
      voidLeadId: closerSaleVoids.leadId,
      accountLeadId: receivableAccounts.leadId,
      currency: receivableAccounts.currency,
      contractedCents: receivableAccounts.contractedAmountCents,
      activeScheduleVersion: receivableAccounts.activeScheduleVersion,
    })
      .from(leads)
      .leftJoin(closer, eq(leads.closerId, closer.id))
      .leftJoin(closerSaleRecords, eq(leads.id, closerSaleRecords.leadId))
      .leftJoin(closerSaleVoids, eq(leads.id, closerSaleVoids.leadId))
      .leftJoin(receivableAccounts, eq(leads.id, receivableAccounts.leadId))
      .where(and(
        isNull(leads.mergedIntoLeadId),
        input.canReadAll ? undefined : eq(leads.closerId, input.actorId),
      ));

    const sales = leadRows.filter((row) => classifySaleEvidence(row) !== null);
    const exclusions = {
      legacyIncompleteSalesCount: 0,
      unconfiguredSalesCount: 0,
      voidedSalesCount: 0,
    };
    const candidates = sales.flatMap((row) => {
      if (row.voidLeadId) {
        exclusions.voidedSalesCount += 1;
        return [];
      }
      if (!row.saleRecordLeadId) {
        exclusions.legacyIncompleteSalesCount += 1;
        return [];
      }
      if (
        !row.accountLeadId
        || !row.currency
        || row.contractedCents === null
        || row.activeScheduleVersion === null
      ) {
        exclusions.unconfiguredSalesCount += 1;
        return [];
      }
      return [{
        leadId: row.leadId,
        leadName: row.leadName,
        closer: { id: row.closerId, name: row.closerName },
        currency: row.currency,
        contractedCents: row.contractedCents,
        activeScheduleVersion: row.activeScheduleVersion,
      }];
    });

    const candidateLeadIds = candidates.map((candidate) => candidate.leadId);
    const installmentRows = candidateLeadIds.length === 0
      ? []
      : await tx.select({
        id: receivableInstallments.id,
        leadId: receivableInstallments.leadId,
        scheduleVersion: receivableInstallments.scheduleVersion,
        sequence: receivableInstallments.sequence,
        dueOn: receivableInstallments.dueOn,
        expectedCents: receivableInstallments.expectedAmountCents,
      })
        .from(receivableInstallments)
        .where(and(
          inArray(receivableInstallments.leadId, candidateLeadIds),
          isNull(receivableInstallments.supersededAt),
        ));

    const configuredSales: DelinquencySale[] = [];
    for (const candidate of candidates) {
      const installments = installmentRows.filter((installment) =>
        installment.leadId === candidate.leadId
        && installment.scheduleVersion === candidate.activeScheduleVersion);
      const scheduledCents = installments.reduce(
        (sum, installment) => sum + installment.expectedCents,
        0,
      );
      if (installments.length === 0 || scheduledCents !== candidate.contractedCents) {
        exclusions.unconfiguredSalesCount += 1;
        continue;
      }
      configuredSales.push({
        leadId: candidate.leadId,
        leadName: candidate.leadName,
        closer: candidate.closer,
        currency: candidate.currency,
        contractedCents: candidate.contractedCents,
        installments: installments.map(({ id, sequence, dueOn, expectedCents }) => ({
          id,
          sequence,
          dueOn,
          expectedCents,
        })),
      });
    }

    const installmentIds = configuredSales.flatMap((sale) =>
      sale.installments.map((installment) => installment.id));
    const allocations = installmentIds.length === 0
      ? []
      : await tx.select({
        installmentId: receivablePaymentAllocations.installmentId,
        paymentEventId: receivablePaymentAllocations.financialEventId,
        amountCents: receivablePaymentAllocations.amountCents,
      })
        .from(receivablePaymentAllocations)
        .where(inArray(receivablePaymentAllocations.installmentId, installmentIds));
    const paymentEventIds = allocations.map((allocation) => allocation.paymentEventId);
    const reversals = paymentEventIds.length === 0
      ? []
      : await tx.select({ reversalOfId: leadFinancialEvents.reversalOfId })
        .from(leadFinancialEvents)
        .where(inArray(leadFinancialEvents.reversalOfId, paymentEventIds));
    const reversedPaymentEventIds = new Set(reversals.flatMap((event) =>
      event.reversalOfId ? [event.reversalOfId] : []));
    const activityRows = installmentIds.length === 0
      ? []
      : await tx.select({
        installmentId: leadActivityEvents.receivableInstallmentId,
        kind: leadActivityEvents.kind,
        occurredAt: leadActivityEvents.occurredAt,
        description: leadActivityEvents.description,
        metadata: leadActivityEvents.metadata,
      })
        .from(leadActivityEvents)
        .where(and(
          inArray(leadActivityEvents.receivableInstallmentId, installmentIds),
          inArray(leadActivityEvents.kind, collectionKinds),
        ));

    return buildDelinquencyReport({
      asOf,
      sales: configuredSales,
      allocations,
      reversedPaymentEventIds,
      collectionActivities: activityRows.flatMap((row) => {
        const activity = parseCollectionActivity(row);
        return activity ? [activity] : [];
      }),
      exclusions,
    });
  }, { isolationLevel: "repeatable read" });
}

function operationConflict(): never {
  throw new TRPCError({
    code: "CONFLICT",
    message: "La operación de seguimiento almacenada está incompleta o no es válida.",
  });
}

function createCollectionStore(tx: Transaction): CollectionFollowUpStore {
  return {
    async findByOperationId(operationId) {
      const prefix = `collection:${operationId}`;
      const events = await tx.select({
        installmentId: leadActivityEvents.receivableInstallmentId,
        actorId: leadActivityEvents.actorId,
        kind: leadActivityEvents.kind,
        description: leadActivityEvents.description,
        metadata: leadActivityEvents.metadata,
      })
        .from(leadActivityEvents)
        .where(inArray(leadActivityEvents.dedupeKey, [
          `${prefix}:reviewed`,
          `${prefix}:contact`,
          `${prefix}:next-action`,
        ]));
      if (events.length === 0) return null;

      const reviewed = events.find((event) => event.kind === "collection_reviewed");
      const contact = events.find((event) => event.kind === "collection_contact_recorded");
      const nextAction = events.find((event) => event.kind === "collection_next_action_scheduled");
      const nextMetadata = nextActionMetadata.safeParse(nextAction?.metadata);
      const contactNote = boundedNote.safeParse(contact?.description);
      const nextActionNote = boundedNote.safeParse(nextAction?.description);
      if (
        events.length !== 3
        || !reviewed
        || !contact
        || !nextAction
        || !reviewed.installmentId
        || reviewed.installmentId !== contact.installmentId
        || reviewed.installmentId !== nextAction.installmentId
        || !reviewed.actorId
        || reviewed.actorId !== contact.actorId
        || reviewed.actorId !== nextAction.actorId
        || !reviewedMetadata.safeParse(reviewed.metadata).success
        || !contactMetadata.safeParse(contact.metadata).success
      ) operationConflict();
      if (!nextMetadata.success || !contactNote.success || !nextActionNote.success) {
        operationConflict();
      }

      return {
        installmentId: reviewed.installmentId,
        actorId: reviewed.actorId,
        contactNote: contactNote.data,
        nextActionOn: nextMetadata.data.scheduledFor,
        nextActionNote: nextActionNote.data,
      };
    },
    async lockInstallment(installmentId) {
      const [row] = await tx.select({
        installmentId: receivableInstallments.id,
        leadId: receivableInstallments.leadId,
        closerId: leads.closerId,
        dueOn: receivableInstallments.dueOn,
        supersededAt: receivableInstallments.supersededAt,
        scheduleVersion: receivableInstallments.scheduleVersion,
        activeScheduleVersion: receivableAccounts.activeScheduleVersion,
      })
        .from(receivableInstallments)
        .innerJoin(
          receivableAccounts,
          eq(receivableInstallments.leadId, receivableAccounts.leadId),
        )
        .innerJoin(leads, eq(receivableInstallments.leadId, leads.id))
        .where(eq(receivableInstallments.id, installmentId))
        .for("update")
        .limit(1);
      return row ? {
        installmentId: row.installmentId,
        leadId: row.leadId,
        closerId: row.closerId,
        dueOn: row.dueOn,
        supersededAt: row.supersededAt,
        isActiveSchedule: row.scheduleVersion === row.activeScheduleVersion,
      } : null;
    },
    async pendingCents(installmentId) {
      const [installment] = await tx.select({
        expectedCents: receivableInstallments.expectedAmountCents,
      })
        .from(receivableInstallments)
        .where(eq(receivableInstallments.id, installmentId))
        .limit(1);
      if (!installment) return 0;
      const allocations = await tx.select({
        paymentEventId: receivablePaymentAllocations.financialEventId,
        amountCents: receivablePaymentAllocations.amountCents,
      })
        .from(receivablePaymentAllocations)
        .where(eq(receivablePaymentAllocations.installmentId, installmentId));
      const eventIds = allocations.map((allocation) => allocation.paymentEventId);
      const reversals = eventIds.length === 0
        ? []
        : await tx.select({ reversalOfId: leadFinancialEvents.reversalOfId })
          .from(leadFinancialEvents)
          .where(inArray(leadFinancialEvents.reversalOfId, eventIds));
      const reversed = new Set(reversals.flatMap((event) =>
        event.reversalOfId ? [event.reversalOfId] : []));
      const paidCents = allocations.reduce((sum, allocation) =>
        reversed.has(allocation.paymentEventId) ? sum : sum + allocation.amountCents, 0);
      return Math.max(
        installment.expectedCents - Math.min(paidCents, installment.expectedCents),
        0,
      );
    },
    async appendEvents(events) {
      await tx.insert(leadActivityEvents).values(events.map((event) => ({
        id: crypto.randomUUID(),
        leadId: event.leadId,
        actorId: event.actorId,
        actorRole: event.actorRole,
        receivableInstallmentId: event.installmentId,
        kind: event.kind,
        title: event.title,
        description: event.description,
        metadata: event.metadata,
        dedupeKey: event.dedupeKey,
        occurredAt: event.occurredAt,
      })));
    },
  };
}

export async function recordCollectionFollowUp(input: RecordCollectionFollowUpInput) {
  return db.transaction((tx) => executeRecordCollectionFollowUp(
    createCollectionStore(tx),
    input,
  ));
}
