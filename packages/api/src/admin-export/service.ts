import { and, db, eq, gte, inArray, lte, sql } from "@crm-fran/db";
import {
  adminDataExports, calendarEvents, closerSaleRecords, closerSaleVoids, leadActivityEvents,
  leadFinancialEvents, leads, paymentProviderProfiles, paymentReconciliationAllocations,
  paymentReconciliationBatches, paymentReconciliations, receivableAccounts,
  receivableInstallments, receivablePaymentAllocations,
} from "@crm-fran/db/schema/index";

import { inclusiveMadridCalendarRange, madridDayKey } from "../commercial-observatory/domain";
import { deriveReceivableState } from "../receivables/domain";
import { createStoredZip, rowsToCsv, safeExportFileName, type ExportCell } from "./archive";
import { assertAdminExportAuthority, type AdminExportAuthority } from "./authority";

export const ADMIN_EXPORT_POLICY_VERSION = "admin-export-v1";
type ExportFilters = { from: string; to: string; currency: string; includePii: boolean };
const hashBytes = async (value: Uint8Array) => {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", copy))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const hashText = (value: string) => hashBytes(new TextEncoder().encode(value));

function dataset(columns: string[], rows: Record<string, ExportCell>[]) {
  return { columns, rows, csv: rowsToCsv(columns, rows) };
}

export async function buildAdminDataExport(input: ExportFilters & { authority: AdminExportAuthority }) {
  const authority = assertAdminExportAuthority(input.authority);
  const { from, to } = inclusiveMadridCalendarRange(input.from, input.to);
  if ((to.getTime() - from.getTime()) / 86_400_000 > 367) throw new RangeError("Export range cannot exceed 366 Madrid calendar days");
  return db.transaction(async (tx) => {
    const marker = await tx.execute(sql`select transaction_timestamp() as as_of`);
    const asOf = new Date(String((marker.rows[0] as { as_of: string | Date }).as_of));
    const leadRows = await tx.select().from(leads).where(and(gte(leads.createdAt, from), lte(leads.createdAt, to)));
    const feedbackLeadRows = await tx.select().from(leads).where(and(gte(leads.updatedAt, from), lte(leads.updatedAt, to)));
    const activityRows = await tx.select().from(leadActivityEvents).where(and(gte(leadActivityEvents.occurredAt, from), lte(leadActivityEvents.occurredAt, to)));
    const agendaRows = await tx.select().from(calendarEvents).where(and(gte(calendarEvents.date, input.from), lte(calendarEvents.date, input.to)));
    const saleRows = await tx.select().from(closerSaleRecords).where(and(gte(closerSaleRecords.soldAt, from), lte(closerSaleRecords.soldAt, to)));
    const saleLeadIds = saleRows.map((sale) => sale.leadId);
    const periodVoidRows = await tx.select().from(closerSaleVoids).where(and(gte(closerSaleVoids.occurredAt, from), lte(closerSaleVoids.occurredAt, to)));
    const linkedVoidRows = saleLeadIds.length ? await tx.select().from(closerSaleVoids).where(and(inArray(closerSaleVoids.leadId, saleLeadIds), lte(closerSaleVoids.occurredAt, asOf))) : [];
    const voidRows = [...new Map([...periodVoidRows, ...linkedVoidRows].map((row) => [row.leadId, row])).values()]
      .filter((row) => row.snapshot.currency === null || row.snapshot.currency === input.currency);
    const voidedLeadIds = new Set(linkedVoidRows.map((row) => row.leadId));
    const ledgerRows = await tx.select().from(leadFinancialEvents).where(and(gte(leadFinancialEvents.occurredAt, from), lte(leadFinancialEvents.occurredAt, to), eq(leadFinancialEvents.currency, input.currency)));
    const accountRows = saleLeadIds.length ? await tx.select().from(receivableAccounts).where(and(inArray(receivableAccounts.leadId, saleLeadIds), eq(receivableAccounts.currency, input.currency))) : [];
    const accountLeadIds = accountRows.map((account) => account.leadId);
    const installmentRows = accountLeadIds.length ? await tx.select().from(receivableInstallments).where(inArray(receivableInstallments.leadId, accountLeadIds)) : [];
    const installmentIds = installmentRows.map((installment) => installment.id);
    const allocationRows = installmentIds.length ? await tx.select().from(receivablePaymentAllocations).where(inArray(receivablePaymentAllocations.installmentId, installmentIds)) : [];
    const reconciliationRows = await tx.select().from(paymentReconciliations).where(and(gte(paymentReconciliations.occurredAt, from), lte(paymentReconciliations.occurredAt, to), eq(paymentReconciliations.currency, input.currency)));
    const reconciliationIds = reconciliationRows.map((row) => row.id);
    const reconciliationAllocationRows = reconciliationIds.length ? await tx.select().from(paymentReconciliationAllocations).where(inArray(paymentReconciliationAllocations.reconciliationId, reconciliationIds)) : [];
    const batchIds = [...new Set(reconciliationRows.map((row) => row.batchId))];
    const batchRows = batchIds.length ? await tx.select().from(paymentReconciliationBatches).where(inArray(paymentReconciliationBatches.id, batchIds)) : [];
    const profileIds = [...new Set(reconciliationRows.map((row) => row.profileId))];
    const profileRows = profileIds.length ? await tx.select().from(paymentProviderProfiles).where(inArray(paymentProviderProfiles.id, profileIds)) : [];
    const allocationEventIds = [...new Set(allocationRows.map((row) => row.financialEventId))];
    const reversalRows = allocationEventIds.length ? await tx.select().from(leadFinancialEvents).where(inArray(leadFinancialEvents.reversalOfId, allocationEventIds)) : [];

    const leadColumns = ["id", "name", ...(input.includePii ? ["email", "normalizedEmail", "phone", "normalizedPhone"] : []), "source", "campaign", "ad", "creative", "acquisitionAngle", "utmContent", "type", "state", "callerId", "closerId", "poolStatus", "createdAt", "updatedAt"];
    const leadData = dataset(leadColumns, leadRows.map((lead) => ({
      id: lead.id, name: lead.name, ...(input.includePii ? { email: lead.email, normalizedEmail: lead.normalizedEmail, phone: lead.phone, normalizedPhone: lead.normalizedPhone } : {}),
      source: lead.source, campaign: lead.campaign, ad: lead.ad, creative: lead.creative, acquisitionAngle: lead.acquisitionAngle, utmContent: lead.utmContent,
      type: lead.type, state: lead.state, callerId: lead.callerId, closerId: lead.closerId, poolStatus: lead.poolStatus, createdAt: lead.createdAt, updatedAt: lead.updatedAt,
    })));
    const feedbackRows = feedbackLeadRows.flatMap((lead) => lead.questions.map((answer) => ({ leadId: lead.id, questionKey: answer.questionKey, question: answer.question, answer: answer.answer, authorRole: answer.authorRole, authorId: answer.authorId, exportedFromUpdatedAt: lead.updatedAt })));
    const feedbackData = dataset(["leadId", "questionKey", "question", "answer", "authorRole", "authorId", "exportedFromUpdatedAt"], feedbackRows);
    const activityData = dataset(["id", "leadId", "actorId", "actorRole", "kind", "title", "description", "metadata", "occurredAt"], activityRows.map((row) => ({ id: row.id, leadId: row.leadId, actorId: row.actorId, actorRole: row.actorRole, kind: row.kind, title: row.title, description: row.description, metadata: row.metadata, occurredAt: row.occurredAt })));
    const agendaData = dataset(["id", "title", "date", "startTime", "durationMinutes", "callerId", "closerId", "createdById", "createdAt", "updatedAt"], agendaRows);
    const salesData = dataset(["leadId", "saleAmountCents", "amountPaidCents", "currency", "soldAt", "paymentMethod", "financingProvider", "installmentMonths", "onboardingCompleted", "createdAt", "updatedAt"], saleRows.filter((row) => row.currency === input.currency));
    const saleVoidsData = dataset(["leadId", "actorId", "reason", "snapshot", "occurredAt"], voidRows.map((row) => ({ leadId: row.leadId, actorId: row.actorId, reason: row.reason, snapshot: row.snapshot, occurredAt: row.occurredAt })));
    const ledgerData = dataset(["id", "leadId", "kind", "amountCents", "currency", "occurredAt", "createdById", "note", "externalReference", "reversalOfId", "createdAt"], ledgerRows.map((row) => ({ id: row.id, leadId: row.leadId, kind: row.kind, amountCents: row.amountCents, currency: row.currency, occurredAt: row.occurredAt, createdById: row.createdById, note: row.note, externalReference: row.externalReference, reversalOfId: row.reversalOfId, createdAt: row.createdAt })));
    const accountsData = dataset(["leadId", "currency", "contractedAmountCents", "activeScheduleVersion", "updatedById", "createdAt", "updatedAt"], accountRows);
    const installmentsData = dataset(["id", "leadId", "scheduleVersion", "sequence", "dueOn", "expectedAmountCents", "supersededAt", "createdAt"], installmentRows);
    const allocationsData = dataset(["id", "installmentId", "financialEventId", "amountCents", "createdAt"], allocationRows);
    const reconciliationData = dataset(["id", "batchId", "profileId", "externalReference", "leadId", "amountCents", "currency", "occurredAt", "financialEventId", "createdById", "createdAt"], reconciliationRows);
    const reconciliationAllocationsData = dataset(["id", "reconciliationId", "installmentId", "amountCents", "createdAt"], reconciliationAllocationRows);
    const batchesData = dataset(["id", "profileId", "fileName", "contentHash", "rowCount", "createdById", "createdAt"], batchRows);
    const profilesData = dataset(["id", "providerKey", "name", "createdById", "createdAt"], profileRows);

    const reversed = new Set(reversalRows.flatMap((row) => row.reversalOfId ? [row.reversalOfId] : []));
    const processedSalesRows = saleRows.filter((sale) => sale.currency === input.currency && !voidedLeadIds.has(sale.leadId)).map((sale) => {
      const account = accountRows.find((row) => row.leadId === sale.leadId);
      const current = account ? installmentRows.filter((row) => row.leadId === sale.leadId && row.scheduleVersion === account.activeScheduleVersion && !row.supersededAt) : [];
      const currentIds = new Set(current.map((row) => row.id));
      const state = deriveReceivableState({ asOf: madridDayKey(asOf), installments: current.map((row) => ({ id: row.id, sequence: row.sequence, dueOn: row.dueOn, expectedCents: row.expectedAmountCents })), allocations: allocationRows.filter((row) => currentIds.has(row.installmentId)).map((row) => ({ installmentId: row.installmentId, paymentEventId: row.financialEventId, amountCents: row.amountCents })), reversedPaymentEventIds: reversed });
      return { leadId: sale.leadId, currency: sale.currency, contractedCents: state.contractedCents || sale.saleAmountCents, collectedCents: state.collectedCents || sale.amountPaidCents, outstandingCents: state.contractedCents ? state.outstandingCents : sale.saleAmountCents - sale.amountPaidCents, overdueCents: state.overdueCents, nextDueOn: state.nextDueOn, paymentMethod: sale.paymentMethod, financingProvider: sale.financingProvider, installmentMonths: sale.installmentMonths, soldAt: sale.soldAt, policyVersion: ADMIN_EXPORT_POLICY_VERSION, asOf };
    });
    const processedSalesData = dataset(["leadId", "currency", "contractedCents", "collectedCents", "outstandingCents", "overdueCents", "nextDueOn", "paymentMethod", "financingProvider", "installmentMonths", "soldAt", "policyVersion", "asOf"], processedSalesRows);
    const contractedCents = processedSalesRows.reduce((sum, row) => sum + row.contractedCents, 0);
    const collectedCents = processedSalesRows.reduce((sum, row) => sum + row.collectedCents, 0);
    const metricsRows = [{ policyVersion: ADMIN_EXPORT_POLICY_VERSION, asOf, timeZone: "Europe/Madrid", from: input.from, to: input.to, currency: input.currency, leadCount: leadRows.length, saleCount: processedSalesRows.length, conversionRateBps: leadRows.length ? Math.round(processedSalesRows.length * 10_000 / leadRows.length) : 0, contractedCents, collectedCents, outstandingCents: contractedCents - collectedCents, overdueCents: processedSalesRows.reduce((sum, row) => sum + row.overdueCents, 0) }];
    const metricsData = dataset(["policyVersion", "asOf", "timeZone", "from", "to", "currency", "leadCount", "saleCount", "conversionRateBps", "contractedCents", "collectedCents", "outstandingCents", "overdueCents"], metricsRows);
    const files = {
      "leads.csv": leadData, "feedbacks.csv": feedbackData, "lead_activity.csv": activityData, "agendas.csv": agendaData,
      "sales.csv": salesData, "closer_sale_voids.csv": saleVoidsData, "financial_ledger.csv": ledgerData, "receivable_accounts.csv": accountsData,
      "receivable_installments.csv": installmentsData, "receivable_allocations.csv": allocationsData,
      "payment_reconciliations.csv": reconciliationData, "payment_reconciliation_allocations.csv": reconciliationAllocationsData,
      "payment_reconciliation_batches.csv": batchesData, "payment_provider_profiles.csv": profilesData,
      "processed_sales.csv": processedSalesData, "processed_metrics.csv": metricsData,
    };
    const manifest = {
      formatVersion: 1, policyVersion: ADMIN_EXPORT_POLICY_VERSION, asOf: asOf.toISOString(), timeZone: "Europe/Madrid",
      snapshot: { isolationLevel: "repeatable read", marker: "transaction_timestamp" },
      filters: { from: input.from, to: input.to, currency: input.currency, includePii: input.includePii },
      dateBasis: { leads: "createdAt", feedbacks: "lead.updatedAt", agendas: "date", sales: "soldAt", saleVoids: "occurredAt or related sale in range", financialLedger: "occurredAt", reconciliations: "occurredAt" },
      formulas: { activeSales: "processed sales exclude leads with an auditable sale void as of the snapshot", conversionRateBps: "round(saleCount * 10000 / leadCount)", outstandingCents: "contractedCents - collectedCents", overdueCents: "sum(outstanding installments with dueOn before asOf Madrid day)" },
      pii: input.includePii ? "Admin-authorized lead email and phone included" : "Lead email and phone excluded",
      excluded: ["authentication accounts", "password hashes", "sessions", "tokens", "environment secrets", "financial idempotency keys"],
      files: await Promise.all(Object.entries(files).map(async ([name, value]) => ({ name, rows: value.rows.length, sha256: await hashText(value.csv) }))),
    };
    const zip = createStoredZip([...Object.entries(files).map(([name, value]) => ({ name, content: value.csv })), { name: "manifest.json", content: JSON.stringify(manifest, null, 2) }]);
    const fileName = safeExportFileName(asOf.toISOString());
    const archiveSha256 = await hashBytes(zip);
    const rowCounts = Object.fromEntries(Object.entries(files).map(([name, value]) => [name, value.rows.length]));
    await tx.insert(adminDataExports).values({ id: crypto.randomUUID(), actorId: authority.actorId, asOf, filters: { from: input.from, to: input.to, currency: input.currency, includePii: input.includePii }, includesPii: input.includePii, fileName, archiveSha256, rowCounts, policyVersion: ADMIN_EXPORT_POLICY_VERSION });
    return { bytes: zip, fileName, asOf, archiveSha256 };
  }, { isolationLevel: "repeatable read" });
}
