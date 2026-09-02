export type LeadPoolStatus = "new" | "recovered" | "discarded";

export function getLeadPoolProgress(impactCount: number) {
  return `Impacto ${Math.min(Math.max(impactCount, 1), 3)} de 3`;
}

export function isAssignableLeadPool(poolStatus: LeadPoolStatus) {
  return poolStatus !== "discarded";
}

export function splitDiscardedLeads<
  T extends { state?: string | null; noContactImpactCount?: number },
>(leads: readonly T[]) {
  return {
    threeImpacts: leads.filter(
      (lead) =>
        lead.state !== "número erróneo" &&
        (lead.noContactImpactCount ?? 0) >= 3,
    ),
    wrongNumbers: leads.filter(
      (lead) => lead.state === "número erróneo",
    ),
  };
}
