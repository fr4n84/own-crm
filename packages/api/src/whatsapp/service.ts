import { and, asc, db, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "@crm-fran/db";
import { normalizeLeadPhone } from "@crm-fran/db/lead-identity";
import {
  CALLER_ROLE_IDS,
  LEAD_POOL_STATUS,
  LEAD_STATE,
  WHATSAPP_CONSENT_STATUS,
  WHATSAPP_MESSAGE_ORIGIN,
  WHATSAPP_OUTBOX_STATUS,
  leads,
  user,
  whatsappConsentEvents,
  whatsappConsents,
  whatsappOutboxEvents,
  whatsappOutboxMessages,
  type WhatsappConsentEvidence,
} from "@crm-fran/db/schema/index";
import { TRPCError } from "@trpc/server";

import { normalizeMadridRange } from "../commercial-observatory/domain";
import { parseConfirmedFacts } from "../commercial-evidence/facts";
import {
  canApproveWhatsappMessage,
  hasCurrentWhatsappConsent,
  isWhatsappQueueLead,
  type WhatsappConsentStatus,
  type WhatsappQueueStatus,
} from "./domain";

export class WhatsappNotFoundError extends Error {}
export class WhatsappConflictError extends Error {}

function inclusiveMadridRange(from: string, to: string) {
  const nowAfterRange = new Date(`${to}T12:00:00.000Z`);
  nowAfterRange.setUTCDate(nowAfterRange.getUTCDate() + 2);
  return normalizeMadridRange({ fromDay: from, toDay: to, now: nowAfterRange });
}

function currentNormalizedPhone(phone: string) {
  const normalizedPhone = normalizeLeadPhone(phone).normalized;
  if (!normalizedPhone) throw new WhatsappConflictError("The lead does not have a valid current phone number");
  return normalizedPhone;
}

function consentEvidence(input: { evidence: string; reference?: string }): WhatsappConsentEvidence {
  return { note: input.evidence.trim(), ...(input.reference ? { reference: input.reference.trim() } : {}) };
}

function sameSubmission(existing: typeof whatsappOutboxMessages.$inferSelect, input: SubmitWhatsappForApprovalInput) {
  return existing.leadId === input.leadId
    && existing.bodyText === input.bodyText.trim()
    && existing.origin === input.origin
    && existing.contextHash === (input.origin === "ai" ? input.contextHash ?? null : null)
    && existing.submittedById === input.actorId;
}

export async function listWhatsappQueue(input: {
  status: WhatsappQueueStatus;
  from: string;
  to: string;
  callerId?: string;
}) {
  const range = inclusiveMadridRange(input.from, input.to);
  const queueDate = input.status === "sent" ? leads.whatsappSentAt : leads.updatedAt;
  const statusCondition = input.status === "sent"
    ? isNotNull(leads.whatsappSentAt)
    : isNull(leads.whatsappSentAt);
  const attributedCallerId = sql<string | null>`coalesce(${leads.whatsappCallerId}, ${leads.callerId})`;
  const callerCondition = input.callerId ? eq(attributedCallerId, input.callerId) : undefined;

  const [rows, callers] = await Promise.all([
    db.select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      caller: { id: user.id, name: user.name },
      queueDate,
      whatsappSentAt: leads.whatsappSentAt,
    })
      .from(leads)
      .leftJoin(user, eq(user.id, attributedCallerId))
      .where(and(
        eq(leads.poolStatus, LEAD_POOL_STATUS.DISCARDED),
        gte(leads.noContactImpactCount, 3),
        ne(leads.state, LEAD_STATE.NUMERO_ERRONEO),
        statusCondition,
        gte(queueDate, range.from),
        lt(queueDate, range.to),
        callerCondition,
      ))
      .orderBy(desc(queueDate), asc(leads.name)),
    db.select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.roleId, [...CALLER_ROLE_IDS]))
      .orderBy(asc(user.name)),
  ]);

  const leadIds = rows.map((row) => row.id);
  const normalizedPhones = rows.flatMap((row) => {
    const phone = normalizeLeadPhone(row.phone).normalized;
    return phone ? [phone] : [];
  });
  const [consents, messages] = await Promise.all([
    normalizedPhones.length === 0
      ? []
      : db.select().from(whatsappConsents).where(inArray(whatsappConsents.normalizedPhone, normalizedPhones)),
    leadIds.length === 0
      ? []
      : db.select().from(whatsappOutboxMessages)
        .where(inArray(whatsappOutboxMessages.leadId, leadIds))
        .orderBy(desc(whatsappOutboxMessages.createdAt)),
  ]);
  const consentByPhone = new Map(consents.map((consent) => [consent.normalizedPhone, consent]));
  const latestMessageByLead = new Map<string, typeof messages[number]>();
  for (const message of messages) {
    if (!latestMessageByLead.has(message.leadId)) latestMessageByLead.set(message.leadId, message);
  }

  return {
    callers,
    rows: rows.map((row) => {
      const normalizedPhone = normalizeLeadPhone(row.phone).normalized;
      const consent = normalizedPhone ? consentByPhone.get(normalizedPhone) ?? null : null;
      const currentConsent = normalizedPhone && hasCurrentWhatsappConsent({
        leadId: row.id,
        normalizedPhone,
        consent,
      }) ? consent : null;
      const outbox = latestMessageByLead.get(row.id);
      return {
        ...row,
        consent: currentConsent ? {
          id: currentConsent.id,
          status: currentConsent.status,
          version: currentConsent.version,
        } : null,
        outbox: outbox ? {
          id: outbox.id,
          status: outbox.status,
          bodyText: outbox.bodyText,
          origin: outbox.origin,
          submittedById: outbox.submittedById,
          submittedAt: outbox.submittedAt,
          approvedById: outbox.approvedById,
          approvedAt: outbox.approvedAt,
        } : null,
      };
    }),
  };
}

export async function markWhatsappSent(input: {
  leadId: string;
  sent: boolean;
  actorId: string;
}) {
  const [lead] = await db.select({
    id: leads.id,
    noContactImpactCount: leads.noContactImpactCount,
    poolStatus: leads.poolStatus,
    state: leads.state,
  }).from(leads).where(eq(leads.id, input.leadId)).limit(1);

  if (!lead || !isWhatsappQueueLead(lead)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "El lead no pertenece a la cola de WhatsApp" });
  }

  const [updated] = await db.update(leads).set({
    whatsappSentAt: input.sent ? new Date() : null,
    whatsappSentById: input.sent ? input.actorId : null,
  }).where(eq(leads.id, input.leadId)).returning({
    id: leads.id,
    whatsappSentAt: leads.whatsappSentAt,
  });
  return updated;
}

export type WhatsappConsentInput = {
  leadId: string;
  source: string;
  evidence: string;
  reference?: string;
  occurredAt: Date;
  actorId: string;
};

async function recordWhatsappConsent(input: WhatsappConsentInput, status: WhatsappConsentStatus) {
  return db.transaction(async (tx) => {
    const [lead] = await tx.select({
      id: leads.id,
      phone: leads.phone,
      noContactImpactCount: leads.noContactImpactCount,
      poolStatus: leads.poolStatus,
      state: leads.state,
    }).from(leads).where(eq(leads.id, input.leadId)).limit(1);
    if (!lead || !isWhatsappQueueLead(lead)) throw new WhatsappNotFoundError("Lead is not in the WhatsApp queue");
    const normalizedPhone = currentNormalizedPhone(lead.phone);
    const [current] = await tx.select().from(whatsappConsents)
      .where(eq(whatsappConsents.normalizedPhone, normalizedPhone)).for("update").limit(1);
    if (current && current.leadId !== lead.id) {
      throw new WhatsappConflictError("The current phone consent belongs to another lead");
    }
    if (current && input.occurredAt.getTime() <= current.occurredAt.getTime()) {
      throw new WhatsappConflictError("Consent evidence must be newer than the current record");
    }
    const now = new Date();
    const id = current?.id ?? crypto.randomUUID();
    const version = (current?.version ?? 0) + 1;
    const values = {
      leadId: lead.id,
      normalizedPhone,
      status,
      source: input.source.trim(),
      evidence: consentEvidence(input),
      occurredAt: input.occurredAt,
      recordedById: input.actorId,
      version,
      updatedAt: now,
    };
    if (current) await tx.update(whatsappConsents).set(values).where(eq(whatsappConsents.id, id));
    else await tx.insert(whatsappConsents).values({ id, ...values });
    await tx.insert(whatsappConsentEvents).values({
      id: crypto.randomUUID(),
      consentId: id,
      leadId: lead.id,
      normalizedPhone,
      action: status,
      source: input.source.trim(),
      evidence: consentEvidence(input),
      occurredAt: input.occurredAt,
      actorId: input.actorId,
      consentVersion: version,
    });

    if (status === WHATSAPP_CONSENT_STATUS.REVOKED) {
      const cancelled = await tx.update(whatsappOutboxMessages).set({
        status: WHATSAPP_OUTBOX_STATUS.CANCELLED,
        cancelledById: input.actorId,
        cancelledAt: now,
        updatedAt: now,
      }).where(and(
        eq(whatsappOutboxMessages.leadId, lead.id),
        eq(whatsappOutboxMessages.status, WHATSAPP_OUTBOX_STATUS.PENDING_APPROVAL),
      )).returning({ id: whatsappOutboxMessages.id });
      if (cancelled.length > 0) {
        await tx.insert(whatsappOutboxEvents).values(cancelled.map((message) => ({
          id: crypto.randomUUID(),
          messageId: message.id,
          action: "cancelled" as const,
          actorId: input.actorId,
          snapshot: { fromStatus: "pending_approval", toStatus: "cancelled", reason: "consent_revoked" },
          occurredAt: now,
        })));
      }
    }
    return { id, leadId: lead.id, normalizedPhone, status, version };
  });
}

export async function generateWhatsappMessageDraftForLead(input: { leadId: string; actorId: string }) {
  const [lead] = await db.select({
    id: leads.id,
    phone: leads.phone,
    source: leads.source,
    campaign: leads.campaign,
    acquisitionAngle: leads.acquisitionAngle,
    questions: leads.questions,
    noContactImpactCount: leads.noContactImpactCount,
    poolStatus: leads.poolStatus,
    state: leads.state,
  }).from(leads).where(eq(leads.id, input.leadId)).limit(1);
  if (!lead || !isWhatsappQueueLead(lead)) throw new WhatsappNotFoundError("Lead is not in the WhatsApp queue");
  const normalizedPhone = currentNormalizedPhone(lead.phone);
  const [consent] = await db.select().from(whatsappConsents).where(and(
    eq(whatsappConsents.leadId, lead.id),
    eq(whatsappConsents.normalizedPhone, normalizedPhone),
    eq(whatsappConsents.status, WHATSAPP_CONSENT_STATUS.GRANTED),
  )).limit(1);
  if (!hasCurrentWhatsappConsent({ leadId: lead.id, normalizedPhone, consent: consent ?? null })) {
    throw new WhatsappConflictError("Current WhatsApp consent is required before AI drafting");
  }
  const confirmed = parseConfirmedFacts(lead.questions);
  const context = {
    source: lead.source,
    campaign: lead.campaign,
    acquisitionAngle: lead.acquisitionAngle,
    confirmedMotivations: confirmed.motivations,
    confirmedObjections: confirmed.objections,
  };
  const contextHash = await sha256(JSON.stringify(context));
  const { generateWhatsappMessageDraft } = await import("./draft-runtime");
  const draft = await generateWhatsappMessageDraft(context);
  return { ...draft, contextHash };
}

export type SubmitWhatsappForApprovalInput = {
  leadId: string;
  bodyText: string;
  origin: "manual" | "ai";
  contextHash?: string;
  idempotencyKey: string;
  actorId: string;
};

export async function submitWhatsappForApproval(input: SubmitWhatsappForApprovalInput) {
  const bodyText = input.bodyText.trim();
  if (input.origin === WHATSAPP_MESSAGE_ORIGIN.AI && !input.contextHash) {
    throw new WhatsappConflictError("AI-origin messages require their CRM context hash");
  }
  const create = async () => db.transaction(async (tx) => {
    const [existing] = await tx.select().from(whatsappOutboxMessages)
      .where(eq(whatsappOutboxMessages.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (!sameSubmission(existing, input)) throw new WhatsappConflictError("Idempotency key already belongs to a different submission");
      return { ...existing, replayed: true };
    }
    const [lead] = await tx.select({
      id: leads.id,
      phone: leads.phone,
      noContactImpactCount: leads.noContactImpactCount,
      poolStatus: leads.poolStatus,
      state: leads.state,
    }).from(leads).where(eq(leads.id, input.leadId)).limit(1);
    if (!lead || !isWhatsappQueueLead(lead)) throw new WhatsappNotFoundError("Lead is not in the WhatsApp queue");
    const normalizedPhone = currentNormalizedPhone(lead.phone);
    const [consent] = await tx.select().from(whatsappConsents).where(and(
      eq(whatsappConsents.leadId, lead.id),
      eq(whatsappConsents.normalizedPhone, normalizedPhone),
      eq(whatsappConsents.status, WHATSAPP_CONSENT_STATUS.GRANTED),
    )).for("update").limit(1);
    if (!consent || !hasCurrentWhatsappConsent({ leadId: lead.id, normalizedPhone, consent })) {
      throw new WhatsappConflictError("Current WhatsApp consent is required before submission");
    }
    const now = new Date();
    const id = crypto.randomUUID();
    const [message] = await tx.insert(whatsappOutboxMessages).values({
      id,
      leadId: lead.id,
      normalizedRecipient: normalizedPhone,
      consentId: consent.id,
      consentVersion: consent.version,
      bodyText,
      origin: input.origin,
      contextHash: input.origin === WHATSAPP_MESSAGE_ORIGIN.AI ? input.contextHash ?? null : null,
      status: WHATSAPP_OUTBOX_STATUS.PENDING_APPROVAL,
      idempotencyKey: input.idempotencyKey,
      submittedById: input.actorId,
      submittedAt: now,
      updatedAt: now,
    }).returning();
    if (!message) throw new WhatsappConflictError("WhatsApp outbox submission could not be created");
    await tx.insert(whatsappOutboxEvents).values({
      id: crypto.randomUUID(),
      messageId: message.id,
      action: "submitted",
      actorId: input.actorId,
      snapshot: { toStatus: "pending_approval", consentVersion: consent.version },
      occurredAt: now,
    });
    return { ...message, replayed: false };
  });

  try {
    return await create();
  } catch (error) {
    const [existing] = await db.select().from(whatsappOutboxMessages)
      .where(eq(whatsappOutboxMessages.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing && sameSubmission(existing, input)) return { ...existing, replayed: true };
    throw error;
  }
}

export async function approveWhatsappMessage(input: { messageId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const [message] = await tx.select().from(whatsappOutboxMessages)
      .where(eq(whatsappOutboxMessages.id, input.messageId)).for("update").limit(1);
    if (!message) throw new WhatsappNotFoundError("WhatsApp outbox message was not found");
    if (message.status === WHATSAPP_OUTBOX_STATUS.APPROVED) return { ...message, replayed: true };
    if (message.status !== WHATSAPP_OUTBOX_STATUS.PENDING_APPROVAL) {
      throw new WhatsappConflictError("Only messages pending approval can be approved");
    }
    if (!canApproveWhatsappMessage({ creatorId: message.submittedById, approverId: input.actorId })) {
      throw new WhatsappConflictError("A different human must approve the prepared message");
    }
    const [lead] = await tx.select({ id: leads.id, phone: leads.phone }).from(leads)
      .where(eq(leads.id, message.leadId)).limit(1);
    if (!lead) throw new WhatsappNotFoundError("Lead was not found");
    const normalizedPhone = currentNormalizedPhone(lead.phone);
    const [consent] = await tx.select().from(whatsappConsents).where(and(
      eq(whatsappConsents.id, message.consentId),
      eq(whatsappConsents.leadId, lead.id),
      eq(whatsappConsents.normalizedPhone, normalizedPhone),
      eq(whatsappConsents.status, WHATSAPP_CONSENT_STATUS.GRANTED),
      eq(whatsappConsents.version, message.consentVersion),
    )).limit(1);
    if (!consent || !hasCurrentWhatsappConsent({ leadId: lead.id, normalizedPhone, consent })) {
      throw new WhatsappConflictError("WhatsApp consent or the current phone changed; prepare a new message");
    }
    const now = new Date();
    const [approved] = await tx.update(whatsappOutboxMessages).set({
      status: WHATSAPP_OUTBOX_STATUS.APPROVED,
      approvedById: input.actorId,
      approvedAt: now,
      updatedAt: now,
    }).where(and(
      eq(whatsappOutboxMessages.id, message.id),
      eq(whatsappOutboxMessages.status, WHATSAPP_OUTBOX_STATUS.PENDING_APPROVAL),
    )).returning();
    if (!approved) throw new WhatsappConflictError("WhatsApp outbox message changed before approval");
    await tx.insert(whatsappOutboxEvents).values({
      id: crypto.randomUUID(),
      messageId: approved.id,
      action: "approved",
      actorId: input.actorId,
      snapshot: { fromStatus: "pending_approval", toStatus: "approved", consentVersion: consent.version },
      occurredAt: now,
    });
    return { ...approved, replayed: false };
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const whatsappService = {
  recordConsent: (input: WhatsappConsentInput) => recordWhatsappConsent(input, WHATSAPP_CONSENT_STATUS.GRANTED),
  revokeConsent: (input: WhatsappConsentInput) => recordWhatsappConsent(input, WHATSAPP_CONSENT_STATUS.REVOKED),
  generateDraft: generateWhatsappMessageDraftForLead,
  submitForApproval: submitWhatsappForApproval,
  approveMessage: approveWhatsappMessage,
};
