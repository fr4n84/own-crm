import { TRPCError } from "@trpc/server";

import { alias, and, asc, db, eq, isNull, or, sql } from "@crm-fran/db";
import {
  alerts,
  callFeedbackUsage,
  closerSaleRecords,
  commercialExperimentAssignments,
  leadActivityEvents,
  leadAliases,
  leadDuplicateCases,
  leadFinancialEvents,
  leadMarketingAttributions,
  leadMergeAudit,
  leads,
  LEAD_DUPLICATE_STATUS,
  rankingEvents,
} from "@crm-fran/db/schema/index";
import {
  findDuplicateSignals,
  selectUniqueExactTripleDuplicate,
} from "@crm-fran/db/lead-identity";

import {
  assertMergeableRelationships,
  buildDuplicatePage,
  mergeQuestions,
  processDuplicateBatchEntries,
  tryAutomaticDuplicateMerge,
  type DuplicateBatchEntry,
  type DuplicateCursor,
} from "./domain";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LeadIdentityCandidate = {
  id: string;
  name: string;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
};

export async function createDuplicateCasesForLead(
  tx: Transaction,
  lead: LeadIdentityCandidate,
  actorId: string,
) {
  const candidates = await tx
    .select({
      id: leads.id,
      name: leads.name,
      normalizedEmail: leads.normalizedEmail,
      normalizedPhone: leads.normalizedPhone,
    })
    .from(leads)
    .where(and(isNull(leads.mergedIntoLeadId), sql`${leads.id} <> ${lead.id}`));
  const cases = candidates.flatMap((candidate) => {
    const signals = findDuplicateSignals(lead, candidate);
    if (signals.reasons.length === 0) return [];
    const [leadAId, leadBId] = [lead.id, candidate.id].sort();
    if (!leadAId || !leadBId) return [];
    return [{
      id: crypto.randomUUID(),
      leadAId,
      leadBId,
      reasons: signals.reasons,
      nameSimilarity: signals.nameSimilarity,
    }];
  });
  if (cases.length > 0) {
    await tx.insert(leadDuplicateCases).values(cases).onConflictDoNothing();
  }

  const exactCandidate = selectUniqueExactTripleDuplicate(lead, candidates);
  if (!exactCandidate) return { cases, autoMerged: null };
  const exactCase = cases.find((item) =>
    (item.leadAId === lead.id && item.leadBId === exactCandidate.id)
    || (item.leadAId === exactCandidate.id && item.leadBId === lead.id));
  if (!exactCase) return { cases, autoMerged: null };

  const autoMerged = await tryAutomaticDuplicateMerge(
    {
      caseId: exactCase.id,
      canonicalLeadId: exactCandidate.id,
      actorId,
    },
    (input) => mergeDuplicateCaseInTransaction(tx, input),
  );
  return { cases, autoMerged };
}

export async function listDuplicateCases(input: {
  cursor?: DuplicateCursor;
  pageSize?: number;
} = {}) {
  const pageSize = input.pageSize ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El tamaño de página debe estar entre 1 y 50" });
  }
  const cursorDate = input.cursor ? new Date(input.cursor.createdAt) : null;
  if (cursorDate && Number.isNaN(cursorDate.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El cursor de duplicados no es válido" });
  }

  const leadA = alias(leads, "duplicate_lead_a");
  const leadB = alias(leads, "duplicate_lead_b");
  const cursorCondition = input.cursor && cursorDate
    ? sql`(${leadDuplicateCases.createdAt} > ${cursorDate} OR (${leadDuplicateCases.createdAt} = ${cursorDate} AND ${leadDuplicateCases.id} > ${input.cursor.id}))`
    : undefined;
  const rows = await db
    .select({
      id: leadDuplicateCases.id,
      reasons: leadDuplicateCases.reasons,
      nameSimilarity: leadDuplicateCases.nameSimilarity,
      createdAt: leadDuplicateCases.createdAt,
      leadA: { id: leadA.id, name: leadA.name, email: leadA.email, phone: leadA.phone },
      leadB: { id: leadB.id, name: leadB.name, email: leadB.email, phone: leadB.phone },
    })
    .from(leadDuplicateCases)
    .innerJoin(leadA, eq(leadA.id, leadDuplicateCases.leadAId))
    .innerJoin(leadB, eq(leadB.id, leadDuplicateCases.leadBId))
    .where(and(
      eq(leadDuplicateCases.status, LEAD_DUPLICATE_STATUS.OPEN),
      isNull(leadA.mergedIntoLeadId),
      isNull(leadB.mergedIntoLeadId),
      cursorCondition,
    ))
    .orderBy(asc(leadDuplicateCases.createdAt), asc(leadDuplicateCases.id))
    .limit(pageSize + 1);
  return buildDuplicatePage(rows, pageSize);
}

export async function dismissDuplicateCase(input: { caseId: string; actorId: string }) {
  const [result] = await db
    .update(leadDuplicateCases)
    .set({ status: LEAD_DUPLICATE_STATUS.DISMISSED, resolvedAt: new Date(), resolvedById: input.actorId })
    .where(and(eq(leadDuplicateCases.id, input.caseId), eq(leadDuplicateCases.status, LEAD_DUPLICATE_STATUS.OPEN)))
    .returning({ id: leadDuplicateCases.id });
  if (!result) throw new TRPCError({ code: "CONFLICT", message: "El caso ya no está pendiente" });
  return result;
}

async function mergeDuplicateCaseInTransaction(
  tx: Transaction,
  input: {
    caseId: string;
    canonicalLeadId: string;
    actorId: string;
  },
) {
  await tx.execute(sql`select id from lead_duplicate_cases where id = ${input.caseId} for update`);
  const [duplicateCase] = await tx.select().from(leadDuplicateCases).where(eq(leadDuplicateCases.id, input.caseId)).limit(1);
  if (!duplicateCase || duplicateCase.status !== LEAD_DUPLICATE_STATUS.OPEN) {
    throw new TRPCError({ code: "CONFLICT", message: "El caso ya no está pendiente" });
  }
  if (input.canonicalLeadId !== duplicateCase.leadAId && input.canonicalLeadId !== duplicateCase.leadBId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El lead principal no pertenece al caso" });
  }
  const sourceLeadId = input.canonicalLeadId === duplicateCase.leadAId ? duplicateCase.leadBId : duplicateCase.leadAId;
  await tx.execute(sql`select id from leads where id in (${sourceLeadId}, ${input.canonicalLeadId}) order by id for update`);
  const [source] = await tx.select().from(leads).where(eq(leads.id, sourceLeadId)).limit(1);
  const [target] = await tx.select().from(leads).where(eq(leads.id, input.canonicalLeadId)).limit(1);
  if (!source || !target || source.mergedIntoLeadId || target.mergedIntoLeadId) {
    throw new TRPCError({ code: "CONFLICT", message: "Uno de los leads ya fue fusionado" });
  }

  const [sourceSales, targetSales, sourceAttribution, targetAttribution, sourceExperiments, targetExperiments] = await Promise.all([
    tx.select({ leadId: closerSaleRecords.leadId }).from(closerSaleRecords).where(eq(closerSaleRecords.leadId, sourceLeadId)).limit(1),
    tx.select({ leadId: closerSaleRecords.leadId }).from(closerSaleRecords).where(eq(closerSaleRecords.leadId, target.id)).limit(1),
    tx.select({ leadId: leadMarketingAttributions.leadId }).from(leadMarketingAttributions).where(eq(leadMarketingAttributions.leadId, sourceLeadId)).limit(1),
    tx.select({ leadId: leadMarketingAttributions.leadId }).from(leadMarketingAttributions).where(eq(leadMarketingAttributions.leadId, target.id)).limit(1),
    tx.select({ experimentId: commercialExperimentAssignments.experimentId }).from(commercialExperimentAssignments).where(eq(commercialExperimentAssignments.leadId, sourceLeadId)),
    tx.select({ experimentId: commercialExperimentAssignments.experimentId }).from(commercialExperimentAssignments).where(eq(commercialExperimentAssignments.leadId, target.id)),
  ]);
  assertMergeableRelationships({
    sourceHasSale: sourceSales.length > 0,
    targetHasSale: targetSales.length > 0,
    sourceHasAttribution: sourceAttribution.length > 0,
    targetHasAttribution: targetAttribution.length > 0,
    sourceExperimentIds: sourceExperiments.map((row) => row.experimentId),
    targetExperimentIds: targetExperiments.map((row) => row.experimentId),
  });

  const auditId = crypto.randomUUID();
  await tx.insert(leadMergeAudit).values({
    id: auditId,
    sourceLeadId,
    canonicalLeadId: target.id,
    actorId: input.actorId,
    duplicateCaseId: duplicateCase.id,
    snapshot: {
      source: { callerId: source.callerId, closerId: source.closerId, state: source.state, poolStatus: source.poolStatus },
      canonical: { callerId: target.callerId, closerId: target.closerId, state: target.state, poolStatus: target.poolStatus },
    },
  });

  for (const table of [alerts, callFeedbackUsage, leadActivityEvents, leadFinancialEvents, rankingEvents]) {
    await tx.update(table).set({ leadId: target.id }).where(eq(table.leadId, sourceLeadId));
  }
  if (sourceSales.length > 0) await tx.update(closerSaleRecords).set({ leadId: target.id }).where(eq(closerSaleRecords.leadId, sourceLeadId));
  if (sourceAttribution.length > 0) await tx.update(leadMarketingAttributions).set({ leadId: target.id }).where(eq(leadMarketingAttributions.leadId, sourceLeadId));
  if (sourceExperiments.length > 0) await tx.update(commercialExperimentAssignments).set({ leadId: target.id }).where(eq(commercialExperimentAssignments.leadId, sourceLeadId));

  await tx.update(leads).set({
    questions: mergeQuestions(target.questions, source.questions),
    callerId: target.callerId ?? source.callerId,
    closerId: target.closerId ?? source.closerId,
    normalizedEmail: target.normalizedEmail ?? source.normalizedEmail,
    normalizedPhone: target.normalizedPhone ?? source.normalizedPhone,
  }).where(eq(leads.id, target.id));
  await tx.update(leads).set({
    mergedIntoLeadId: target.id,
    mergedAt: new Date(),
    mergedById: input.actorId,
    callerId: null,
    callerAssignedAt: null,
    closerId: null,
  }).where(eq(leads.id, sourceLeadId));
  await tx.insert(leadAliases).values({ aliasLeadId: sourceLeadId, canonicalLeadId: target.id, mergeAuditId: auditId });
  await tx.update(leadDuplicateCases).set({
    status: LEAD_DUPLICATE_STATUS.MERGED,
    resolvedAt: new Date(),
    resolvedById: input.actorId,
  }).where(eq(leadDuplicateCases.id, duplicateCase.id));
  await tx.update(leadDuplicateCases).set({
    status: LEAD_DUPLICATE_STATUS.DISMISSED,
    resolvedAt: new Date(),
    resolvedById: input.actorId,
  }).where(and(
    eq(leadDuplicateCases.status, LEAD_DUPLICATE_STATUS.OPEN),
    or(eq(leadDuplicateCases.leadAId, sourceLeadId), eq(leadDuplicateCases.leadBId, sourceLeadId)),
  ));
  return { canonicalLeadId: target.id, aliasLeadId: sourceLeadId, auditId };
}

export async function mergeDuplicateCase(input: {
  caseId: string;
  canonicalLeadId: string;
  actorId: string;
}) {
  return db.transaction((tx) => mergeDuplicateCaseInTransaction(tx, input));
}

export async function mergeDuplicateBatch(input: {
  entries: readonly DuplicateBatchEntry[];
  actorId: string;
}) {
  if (input.entries.length < 1 || input.entries.length > 50) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El lote debe contener entre 1 y 50 casos" });
  }
  return processDuplicateBatchEntries(input.entries, input.actorId, mergeDuplicateCase);
}
