import { TRPCError } from "@trpc/server";

export type CollectionOperationRecord = {
  installmentId: string;
  actorId: string;
  contactNote: string;
  nextActionOn: string;
  nextActionNote: string;
};

export type CollectionEventInput = {
  installmentId: string;
  leadId: string;
  actorId: string;
  actorRole: "admin" | "closer";
  kind:
    | "collection_reviewed"
    | "collection_contact_recorded"
    | "collection_next_action_scheduled";
  title: string;
  description: string | null;
  metadata: Record<string, string | number>;
  dedupeKey: string;
  occurredAt: Date;
};

export interface CollectionFollowUpStore {
  lockInstallment(installmentId: string): Promise<{
    installmentId: string;
    leadId: string;
    closerId: string | null;
    dueOn: string;
    supersededAt: Date | null;
    isActiveSchedule: boolean;
  } | null>;
  pendingCents(installmentId: string): Promise<number>;
  findByOperationId(operationId: string): Promise<CollectionOperationRecord | null>;
  appendEvents(events: CollectionEventInput[]): Promise<void>;
}

export type RecordCollectionFollowUpInput = {
  installmentId: string;
  actorId: string;
  canManageAll: boolean;
  operationId: string;
  contactNote: string;
  nextActionOn: string;
  nextActionNote: string;
};

function madridDay(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function normalize(input: RecordCollectionFollowUpInput) {
  return {
    ...input,
    contactNote: input.contactNote.trim(),
    nextActionNote: input.nextActionNote.trim(),
  };
}

function sameOperation(
  stored: CollectionOperationRecord,
  input: RecordCollectionFollowUpInput,
) {
  return stored.installmentId === input.installmentId
    && stored.actorId === input.actorId
    && stored.contactNote === input.contactNote
    && stored.nextActionOn === input.nextActionOn
    && stored.nextActionNote === input.nextActionNote;
}

function replayResult(
  stored: CollectionOperationRecord | null,
  input: RecordCollectionFollowUpInput,
) {
  if (!stored) return null;
  if (!sameOperation(stored, input)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "El identificador de operación ya se utilizó con otros datos.",
    });
  }
  return { idempotent: true as const, eventCount: 3 };
}
export async function executeRecordCollectionFollowUp(
  store: CollectionFollowUpStore,
  rawInput: RecordCollectionFollowUpInput,
  clock: () => Date = () => new Date(),
) {
  const input = normalize(rawInput);
  if (
    input.contactNote.length === 0
    || input.contactNote.length > 1_000
    || input.nextActionNote.length === 0
    || input.nextActionNote.length > 1_000
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Las notas deben tener entre 1 y 1000 caracteres.",
    });
  }

  const priorReplay = replayResult(
    await store.findByOperationId(input.operationId),
    input,
  );
  if (priorReplay) return priorReplay;

  const now = clock();
  const today = madridDay(now);
  const installment = await store.lockInstallment(input.installmentId);
  const concurrentReplay = replayResult(
    await store.findByOperationId(input.operationId),
    input,
  );
  if (concurrentReplay) return concurrentReplay;
  if (
    !installment
    || installment.supersededAt !== null
    || !installment.isActiveSchedule
    || installment.dueOn >= today
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "La cuota no está vencida y activa.",
    });
  }
  if (!input.canManageAll && installment.closerId !== input.actorId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No puedes gestionar una cuota de otro closer.",
    });
  }
  if (input.nextActionOn < today) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "La próxima acción no puede quedar en el pasado.",
    });
  }
  if (await store.pendingCents(input.installmentId) <= 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "La cuota ya está saldada por pagos efectivos.",
    });
  }

  const prefix = "collection:" + input.operationId;
  const common = {
    installmentId: input.installmentId,
    leadId: installment.leadId,
    actorId: input.actorId,
    actorRole: input.canManageAll ? "admin" as const : "closer" as const,
    occurredAt: now,
  };
  await store.appendEvents([
    {
      ...common,
      kind: "collection_reviewed",
      title: "Impago revisado",
      description: null,
      metadata: { schemaVersion: 1 },
      dedupeKey: prefix + ":reviewed",
    },
    {
      ...common,
      kind: "collection_contact_recorded",
      title: "Contacto de cobro registrado",
      description: input.contactNote,
      metadata: { schemaVersion: 1, channel: "unspecified" },
      dedupeKey: prefix + ":contact",
    },
    {
      ...common,
      kind: "collection_next_action_scheduled",
      title: "Próxima acción de cobro programada",
      description: input.nextActionNote,
      metadata: { schemaVersion: 1, scheduledFor: input.nextActionOn },
      dedupeKey: prefix + ":next-action",
    },
  ]);

  return { idempotent: false as const, eventCount: 3 };
}
