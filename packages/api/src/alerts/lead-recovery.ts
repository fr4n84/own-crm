export type LeadPoolStatus = "new" | "recovered" | "discarded";

type RecoveryAlert = {
  kind: string;
  nextShowAt: Date;
  resolvedAt: Date | null;
  dismissedAt: Date | null;
  targetUserId: string | null;
};

type RecoveryLead = {
  callerId: string | null;
  closerId: string | null;
  poolStatus: LeadPoolStatus;
};

export function getLeadRecoveryTransition(impactCount: number) {
  if (impactCount >= 3) return null;

  const nextImpactCount = impactCount + 1;
  return {
    impactCount: nextImpactCount,
    poolStatus: nextImpactCount === 3 ? "discarded" : "recovered",
  } satisfies { impactCount: number; poolStatus: LeadPoolStatus };
}

export function isRecoverableNoContactAlert(
  alert: RecoveryAlert,
  lead: RecoveryLead,
  now: Date,
) {
  return (
    alert.kind === "no_contact" &&
    alert.resolvedAt === null &&
    alert.dismissedAt === null &&
    alert.nextShowAt <= now &&
    alert.targetUserId !== null &&
    alert.targetUserId === lead.callerId &&
    lead.closerId === null &&
    lead.poolStatus !== "discarded"
  );
}
