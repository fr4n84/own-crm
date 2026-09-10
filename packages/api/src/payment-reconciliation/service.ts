import { alias, and, db, eq, inArray, sql } from "@crm-fran/db";
import { previewProviderPayments } from "@crm-fran/db/reconciliation/payment-import";
import {
  closerSaleRecords, closerSaleVoids, leadFinancialEvents, leads, paymentProviderProfiles,
  paymentReconciliationAllocations, paymentReconciliationBatches,
  paymentReconciliations, receivableAccounts, receivableInstallments, user,
} from "@crm-fran/db/schema/index";
import { TRPCError } from "@trpc/server";

import { allocatePaymentOldestFirst } from "../receivables/domain";
import { syncReceivableAccount } from "../receivables/service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Resolution = { externalReference: string; leadId: string };
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function previewRows(profileId: string, csv: string) {
  const [profile] = await db.select().from(paymentProviderProfiles).where(eq(paymentProviderProfiles.id, profileId)).limit(1);
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil de proveedor no encontrado." });
  const candidates = await db.select({ id: leads.id, name: leads.name, normalizedEmail: leads.normalizedEmail, normalizedPhone: leads.normalizedPhone }).from(leads);
  const rows = previewProviderPayments({ csv, leads: candidates });
  const references = rows.map((row) => row.externalReference);
  const confirmed = references.length === 0 ? [] : await db.select({ externalReference: paymentReconciliations.externalReference }).from(paymentReconciliations).where(and(eq(paymentReconciliations.profileId, profileId), inArray(paymentReconciliations.externalReference, references)));
  const duplicates = new Set(confirmed.map((row) => row.externalReference));
  return { profile, rows: rows.map((row) => duplicates.has(row.externalReference) ? { ...row, matchStatus: "duplicate" as const, matchedLeadId: null } : row) };
}

export const paymentReconciliationService = {
  listProfiles() { return db.select().from(paymentProviderProfiles); },
  async createProfile(input: { providerKey: string; name: string; actorId: string }) {
    const [created] = await db.insert(paymentProviderProfiles).values({ id: crypto.randomUUID(), providerKey: input.providerKey, name: input.name, createdById: input.actorId }).onConflictDoNothing().returning();
    if (created) return created;
    throw new TRPCError({ code: "CONFLICT", message: "Ya existe un perfil con esa clave de proveedor." });
  },
  async preview(input: { profileId: string; csv: string }) {
    const { rows } = await previewRows(input.profileId, input.csv);
    return { rows, contentHash: await digest(input.csv) };
  },
  async confirm(input: { profileId: string; fileName: string; csv: string; resolutions: Resolution[]; actorId: string }) {
    const initial = await previewRows(input.profileId, input.csv);
    const resolutionByReference = new Map(input.resolutions.map((item) => [item.externalReference, item.leadId]));
    const internalDuplicate = initial.rows.find((row) => row.matchStatus === "duplicate" && initial.rows.filter((other) => other.externalReference === row.externalReference).length > 1);
    const unresolved = initial.rows.find((row) => (row.matchStatus === "ambiguous" && !resolutionByReference.has(row.externalReference)) || row.matchStatus === "unmatched");
    if (internalDuplicate) throw new TRPCError({ code: "BAD_REQUEST", message: "El CSV contiene referencias repetidas; corrígelo antes de confirmar." });
    if (unresolved) throw new TRPCError({ code: "BAD_REQUEST", message: "Resuelve todas las coincidencias ambiguas; las filas sin coincidencia no se confirman automáticamente." });
    const contentHash = await digest(input.csv);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select id from payment_provider_profiles where id = ${input.profileId} for update`);
      const batchId = crypto.randomUUID();
      await tx.insert(paymentReconciliationBatches).values({ id: batchId, profileId: input.profileId, fileName: input.fileName, contentHash, rowCount: initial.rows.length, createdById: input.actorId });
      let confirmed = 0;
      let duplicates = 0;
      for (const row of initial.rows) {
        const [existing] = await tx.select().from(paymentReconciliations).where(and(eq(paymentReconciliations.profileId, input.profileId), eq(paymentReconciliations.externalReference, row.externalReference))).limit(1);
        if (existing) { duplicates += 1; continue; }
        const selectedLeadId = resolutionByReference.get(row.externalReference) ?? row.matchedLeadId;
        if (!selectedLeadId || (row.matchStatus === "ambiguous" && !row.candidates.some((candidate) => candidate.id === selectedLeadId))) throw new TRPCError({ code: "BAD_REQUEST", message: `La referencia ${row.externalReference} requiere una selección explícita válida.` });
        await confirmRow(tx, { ...row, leadId: selectedLeadId, profileId: input.profileId, batchId, actorId: input.actorId });
        confirmed += 1;
      }
      return { batchId, confirmed, duplicates };
    });
  },
  async cashRealizedReport() {
    const caller = alias(user, "reconciliation_caller");
    const closer = alias(user, "reconciliation_closer");
    const rows = await db.select({
      leadId: paymentReconciliations.leadId, amountCents: paymentReconciliations.amountCents,
      currency: paymentReconciliations.currency, caller: caller.name, closer: closer.name,
      campaign: leads.campaign, financingProvider: closerSaleRecords.financingProvider,
    }).from(paymentReconciliations).innerJoin(leads, eq(leads.id, paymentReconciliations.leadId))
      .leftJoin(caller, eq(caller.id, leads.callerId)).leftJoin(closer, eq(closer.id, leads.closerId))
      .leftJoin(closerSaleRecords, eq(closerSaleRecords.leadId, leads.id));
    const leadIds = [...new Set(rows.map((row) => row.leadId))];
    const events = leadIds.length === 0 ? [] : await db.select().from(leadFinancialEvents).where(inArray(leadFinancialEvents.leadId, leadIds));
    const reversed = new Set(events.filter((event) => event.kind === "reversal" && event.reversalOfId).map((event) => event.reversalOfId!));
    const costs = new Map<string, number>();
    for (const event of events) if (!reversed.has(event.id) && ["refund", "chargeback", "commission", "cost"].includes(event.kind)) costs.set(`${event.leadId}:${event.currency}`, (costs.get(`${event.leadId}:${event.currency}`) ?? 0) + event.amountCents);
    const leadCash = new Map<string, number>();
    for (const row of rows) leadCash.set(`${row.leadId}:${row.currency}`, (leadCash.get(`${row.leadId}:${row.currency}`) ?? 0) + row.amountCents);
    const uniqueLeads = new Map(rows.map((row) => [`${row.leadId}:${row.currency}`, row]));
    const grouped = new Map<string, { caller: string; closer: string; campaign: string; financingProvider: string; currency: string; cashCollectedCents: number; realizedMarginCents: number }>();
    for (const [leadKey, row] of uniqueLeads) {
      const dimensions = {
        caller: row.caller ?? "Sin caller", closer: row.closer ?? "Sin closer",
        campaign: row.campaign ?? "Sin campaña", financingProvider: row.financingProvider ?? "Sin financiera",
        currency: row.currency,
      };
      const groupKey = JSON.stringify(dimensions);
      const current = grouped.get(groupKey) ?? { ...dimensions, cashCollectedCents: 0, realizedMarginCents: 0 };
      const cash = leadCash.get(leadKey) ?? 0;
      current.cashCollectedCents += cash;
      current.realizedMarginCents += cash - (costs.get(leadKey) ?? 0);
      grouped.set(groupKey, current);
    }
    return [...grouped.values()];
  },
};

async function confirmRow(tx: Transaction, input: { externalReference: string; amountCents: number; currency: string; occurredAt: string; leadId: string; profileId: string; batchId: string; actorId: string }) {
  await tx.execute(sql`select lead_id from closer_sale_records where lead_id = ${input.leadId} for update`);
  const [sale] = await tx.select().from(closerSaleRecords).where(eq(closerSaleRecords.leadId, input.leadId)).limit(1);
  if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "La coincidencia no tiene una venta gestionable." });
  const [voided] = await tx.select({ leadId: closerSaleVoids.leadId }).from(closerSaleVoids).where(eq(closerSaleVoids.leadId, input.leadId)).limit(1);
  if (voided) throw new TRPCError({ code: "CONFLICT", message: "La venta está anulada y no admite conciliaciones nuevas." });
  if (sale.currency !== input.currency) throw new TRPCError({ code: "BAD_REQUEST", message: "La moneda del cobro no coincide con la cuenta por cobrar." });
  const newPaidCents = sale.amountPaidCents + input.amountCents;
  if (newPaidCents > sale.saleAmountCents) throw new TRPCError({ code: "BAD_REQUEST", message: "El cobro supera el saldo pendiente de la venta." });
  const token = (await digest(`${input.profileId}:${input.externalReference}`)).slice(0, 40);
  if (sale.paymentReceivedEventId) {
    const [previous] = await tx.select().from(leadFinancialEvents).where(eq(leadFinancialEvents.id, sale.paymentReceivedEventId)).limit(1);
    if (previous) await tx.insert(leadFinancialEvents).values({ id: crypto.randomUUID(), leadId: input.leadId, kind: "reversal", amountCents: previous.amountCents, currency: previous.currency, occurredAt: new Date(input.occurredAt), createdById: input.actorId, idempotencyKey: `reconciliation:${token}:reverse`, reversalOfId: previous.id, note: "Superseded by reconciled provider payment" });
  }
  const eventId = crypto.randomUUID();
  await tx.insert(leadFinancialEvents).values({ id: eventId, leadId: input.leadId, kind: "payment_received", amountCents: newPaidCents, currency: input.currency, occurredAt: new Date(input.occurredAt), createdById: input.actorId, idempotencyKey: `reconciliation:${token}:payment`, externalReference: input.externalReference, note: "Provider reconciliation aggregate payment snapshot" });
  await tx.update(closerSaleRecords).set({ amountPaidCents: newPaidCents, paymentReceivedEventId: eventId, lastFinancialOperationId: `reconciliation:${token}`, updatedById: input.actorId, updatedAt: new Date() }).where(eq(closerSaleRecords.leadId, input.leadId));
  await syncReceivableAccount(tx, { leadId: input.leadId, actorId: input.actorId, contractedAmountCents: sale.saleAmountCents, amountPaidCents: newPaidCents, currency: sale.currency, soldAt: sale.soldAt, installmentCount: sale.paymentMethod === "financed" ? sale.installmentMonths ?? 1 : 1, paymentEventId: eventId });
  const [account] = await tx.select().from(receivableAccounts).where(eq(receivableAccounts.leadId, input.leadId)).limit(1);
  const installments = account ? await tx.select().from(receivableInstallments).where(and(eq(receivableInstallments.leadId, input.leadId), eq(receivableInstallments.scheduleVersion, account.activeScheduleVersion))).orderBy(receivableInstallments.sequence) : [];
  const domainInstallments = installments.map((item) => ({ id: item.id, sequence: item.sequence, dueOn: item.dueOn, expectedCents: item.expectedAmountCents }));
  const prior = sale.amountPaidCents > 0 ? allocatePaymentOldestFirst({ paymentEventId: "prior", amountCents: sale.amountPaidCents, installments: domainInstallments, alreadyAllocatedCents: new Map() }) : [];
  const exact = allocatePaymentOldestFirst({ paymentEventId: eventId, amountCents: input.amountCents, installments: domainInstallments, alreadyAllocatedCents: new Map(prior.map((item) => [item.installmentId, item.amountCents])) });
  const reconciliationId = crypto.randomUUID();
  await tx.insert(paymentReconciliations).values({ id: reconciliationId, batchId: input.batchId, profileId: input.profileId, externalReference: input.externalReference, leadId: input.leadId, amountCents: input.amountCents, currency: input.currency, occurredAt: new Date(input.occurredAt), financialEventId: eventId, createdById: input.actorId });
  if (exact.length > 0) await tx.insert(paymentReconciliationAllocations).values(exact.map((item) => ({ id: crypto.randomUUID(), reconciliationId, installmentId: item.installmentId, amountCents: item.amountCents })));
}
