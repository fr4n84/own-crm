export type EmailMarketingPermissionState = {
  id: string;
  status: "granted" | "revoked";
  source: string;
  evidence: { reference?: string; note?: string };
  occurredAt: Date;
  version: number;
};

export type EmailMarketingSuppressionState = {
  id: string;
  active: boolean;
  reason: string;
  source: string;
  evidence: { reference?: string; note?: string };
  occurredAt: Date;
  version: number;
};

export type EmailAudienceCandidate = {
  leadId: string;
  leadName: string;
  normalizedEmail: string | null;
  permission: EmailMarketingPermissionState | null;
  suppression: EmailMarketingSuppressionState | null;
};

export type EmailAudienceEvidence = Readonly<{
  permissionId?: string; permissionVersion?: number; permissionSource?: string; permissionOccurredAt?: string;
  suppressionId?: string; suppressionVersion?: number; suppressionSource?: string; suppressionOccurredAt?: string;
  anonymized?: true; policyVersion: string;
}>;

export type EmailAudienceMember = Readonly<{
  leadId: string;
  decision: "included" | "excluded";
  reason: "eligible" | "missing_normalized_email" | "no_active_consent" | "suppressed" | "duplicate_normalized_email";
  evidence: EmailAudienceEvidence;
}>;

const POLICY_VERSION = "email-marketing-v1";

function permissionEvidence(permission: EmailMarketingPermissionState | null) {
  if (!permission) return {};
  return {
    permissionId: permission.id,
    permissionVersion: permission.version,
    permissionSource: permission.source,
    permissionOccurredAt: permission.occurredAt.toISOString(),
  };
}

function suppressionEvidence(suppression: EmailMarketingSuppressionState | null) {
  if (!suppression?.active) return {};
  return {
    suppressionId: suppression.id,
    suppressionVersion: suppression.version,
    suppressionSource: suppression.source,
    suppressionOccurredAt: suppression.occurredAt.toISOString(),
  };
}

function member(
  candidate: EmailAudienceCandidate,
  decision: EmailAudienceMember["decision"],
  reason: EmailAudienceMember["reason"],
): EmailAudienceMember {
  return Object.freeze({
    leadId: candidate.leadId,
    decision,
    reason,
    evidence: Object.freeze({
      policyVersion: POLICY_VERSION,
      ...permissionEvidence(candidate.permission),
      ...suppressionEvidence(candidate.suppression),
    }) as EmailAudienceEvidence,
  });
}

export function buildEmailAudienceSnapshot(candidates: readonly EmailAudienceCandidate[]) {
  const sorted = [...candidates].sort((left, right) => left.leadId.localeCompare(right.leadId));
  const selectedLeadByEmail = new Map<string, string>();
  const members = sorted.map((candidate): EmailAudienceMember => {
    if (!candidate.normalizedEmail) return member(candidate, "excluded", "missing_normalized_email");
    if (candidate.suppression?.active) return member(candidate, "excluded", "suppressed");
    if (candidate.permission?.status !== "granted") return member(candidate, "excluded", "no_active_consent");
    if (selectedLeadByEmail.has(candidate.normalizedEmail)) return member(candidate, "excluded", "duplicate_normalized_email");
    selectedLeadByEmail.set(candidate.normalizedEmail, candidate.leadId);
    return member(candidate, "included", "eligible");
  });
  return Object.freeze({
    policyVersion: POLICY_VERSION,
    sourceKind: "all_unmerged_leads" as const,
    candidateCount: members.length,
    includedCount: members.filter((candidate) => candidate.decision === "included").length,
    members: Object.freeze(members),
  });
}

export function assertAuthorityChangeOrder(input: { currentOccurredAt: Date; nextOccurredAt: Date }) {
  if (input.nextOccurredAt.getTime() < input.currentOccurredAt.getTime()) {
    throw new Error("Evidence occurrence time is older than the current authority decision");
  }
}
export function canUseCampaignForDelivery(input: {
  campaignStatus: "draft" | "ready";
  copyStatus: "draft" | "approved" | "retired";
  includedCount: number;
}) {
  return input.campaignStatus === "ready" && input.copyStatus === "approved" && input.includedCount > 0;
}



