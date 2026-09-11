export type WhatsappQueueStatus = "pending" | "sent";
export type WhatsappConsentStatus = "granted" | "revoked";
export type WhatsappOutboxStatus = "pending_approval" | "approved" | "cancelled";

export type CurrentWhatsappConsent = Readonly<{
  id: string;
  leadId: string;
  normalizedPhone: string;
  status: WhatsappConsentStatus;
  version: number;
}>;

export function isWhatsappQueueLead(input: {
  noContactImpactCount: number;
  poolStatus: string;
  state: string;
}) {
  return input.noContactImpactCount >= 3
    && input.poolStatus === "discarded"
    && input.state !== "número erróneo";
}

export function matchesWhatsappQueueStatus(
  sentAt: Date | null,
  status: WhatsappQueueStatus,
) {
  return status === "sent" ? sentAt !== null : sentAt === null;
}

export function hasCurrentWhatsappConsent(input: {
  leadId: string;
  normalizedPhone: string;
  consent: CurrentWhatsappConsent | null;
}) {
  return input.consent?.status === "granted"
    && input.consent.leadId === input.leadId
    && input.consent.normalizedPhone === input.normalizedPhone
    && input.consent.version >= 1;
}

export function canTransitionWhatsappOutbox(
  from: WhatsappOutboxStatus,
  to: string,
) {
  return from === "pending_approval" && (to === "approved" || to === "cancelled");
}

export function canApproveWhatsappMessage(input: {
  creatorId: string;
  approverId: string;
}) {
  return input.creatorId !== input.approverId;
}
