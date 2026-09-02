export type WhatsappQueueStatus = "pending" | "sent";

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
