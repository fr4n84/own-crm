import { TRPCError } from "@trpc/server";

import type { LeadQASession } from "@crm-fran/db/schema/leads";

export function assertMergeableRelationships(input: {
  sourceHasSale: boolean;
  targetHasSale: boolean;
  sourceHasAttribution: boolean;
  targetHasAttribution: boolean;
  sourceExperimentIds: readonly string[];
  targetExperimentIds: readonly string[];
}) {
  if (input.sourceHasSale && input.targetHasSale) {
    throw new TRPCError({ code: "CONFLICT", message: "Ambos leads tienen una venta; revisa cuál conservar antes de fusionar" });
  }
  if (input.sourceHasAttribution && input.targetHasAttribution) {
    throw new TRPCError({ code: "CONFLICT", message: "Ambos leads tienen atribución; revisa cuál conservar antes de fusionar" });
  }
  const targetExperiments = new Set(input.targetExperimentIds);
  if (input.sourceExperimentIds.some((id) => targetExperiments.has(id))) {
    throw new TRPCError({ code: "CONFLICT", message: "Los leads coinciden en un mismo experimento; revisa la asignación antes de fusionar" });
  }
}

export function mergeQuestions(target: LeadQASession, source: LeadQASession): LeadQASession {
  const seen = new Set(target.map((question) => JSON.stringify(question)));
  return [...target, ...source.filter((question) => !seen.has(JSON.stringify(question)))];
}

export type DuplicateCursor = { createdAt: string; id: string };

export function buildDuplicatePage<T extends { id: string; createdAt: Date }>(
  rows: readonly T[],
  pageSize: number,
) {
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > pageSize && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null,
  };
}

export type DuplicateBatchEntry = { caseId: string; canonicalLeadId: string };
type MergeResult = { canonicalLeadId: string; aliasLeadId: string; auditId: string };
type MergeDuplicate = (input: DuplicateBatchEntry & { actorId: string }) => Promise<MergeResult>;

export async function processDuplicateBatchEntries(
  entries: readonly DuplicateBatchEntry[],
  actorId: string,
  mergeDuplicate: MergeDuplicate,
) {
  const results: Array<
    | ({ caseId: string; status: "merged" } & MergeResult)
    | { caseId: string; status: "failed"; code: string; message: string }
  > = [];
  for (const entry of entries) {
    try {
      const merged = await mergeDuplicate({ ...entry, actorId });
      results.push({ caseId: entry.caseId, status: "merged", ...merged });
    } catch (error) {
      results.push({
        caseId: entry.caseId,
        status: "failed",
        code: error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR",
        message: error instanceof TRPCError
          ? error.message
          : "No se pudo procesar este caso por un error inesperado.",
      });
    }
  }
  return results;
}
export async function tryAutomaticDuplicateMerge(
  input: DuplicateBatchEntry & { actorId: string },
  mergeDuplicate: MergeDuplicate,
) {
  try {
    return await mergeDuplicate(input);
  } catch (error) {
    if (error instanceof TRPCError && error.code === "CONFLICT") return null;
    throw error;
  }
}