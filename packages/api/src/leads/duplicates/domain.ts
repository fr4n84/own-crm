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
