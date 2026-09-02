import type { LeadFinancialEventKind } from "@crm-fran/db/schema/index";

type StoredEvent = {
  leadId: string;
  kind: LeadFinancialEventKind;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  note: string | null;
  externalReference: string | null;
  reversalOfId: string | null;
};

export function isSameRecordRequest(
  event: StoredEvent,
  input: {
    leadId: string;
    kind: Exclude<LeadFinancialEventKind, "reversal">;
    amountCents: number;
    currency: string;
    occurredAt: Date;
    note?: string;
    externalReference?: string;
  },
) {
  return (
    event.leadId === input.leadId &&
    event.kind === input.kind &&
    event.amountCents === input.amountCents &&
    event.currency === input.currency &&
    event.occurredAt.getTime() === input.occurredAt.getTime() &&
    event.note === (input.note ?? null) &&
    event.externalReference === (input.externalReference ?? null) &&
    event.reversalOfId === null
  );
}

export function isSameReversalRequest(
  event: StoredEvent,
  input: {
    leadId: string;
    eventId: string;
    occurredAt: Date;
    note?: string;
  },
) {
  return (
    event.kind === "reversal" &&
    event.leadId === input.leadId &&
    event.reversalOfId === input.eventId &&
    event.occurredAt.getTime() === input.occurredAt.getTime() &&
    event.note === (input.note ?? null)
  );
}

export function reversalProblem(
  original: Pick<StoredEvent, "leadId" | "kind"> | undefined,
  leadId: string,
): "not_found" | "reversal_of_reversal" | null {
  if (!original || original.leadId !== leadId) return "not_found";
  if (original.kind === "reversal") return "reversal_of_reversal";
  return null;
}

export type ReversalInsertConflict =
  | "retry"
  | "idempotency_conflict"
  | "already_reversed"
  | "unknown";

export function classifyReversalInsertConflict(
  state: {
    idempotencyEvent: StoredEvent | undefined;
    sourceReversalExists: boolean;
  },
  input: {
    leadId: string;
    eventId: string;
    occurredAt: Date;
    note?: string;
  },
): ReversalInsertConflict {
  if (state.idempotencyEvent) {
    return isSameReversalRequest(state.idempotencyEvent, input)
      ? "retry"
      : "idempotency_conflict";
  }
  return state.sourceReversalExists ? "already_reversed" : "unknown";
}
