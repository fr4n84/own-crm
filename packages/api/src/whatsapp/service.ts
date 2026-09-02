import { and, asc, db, desc, eq, gte, inArray, isNotNull, isNull, lt, ne } from "@crm-fran/db";
import { CALLER_ROLE_IDS, LEAD_POOL_STATUS, LEAD_STATE, leads, user } from "@crm-fran/db/schema/index";
import { TRPCError } from "@trpc/server";

import { normalizeMadridRange } from "../commercial-observatory/domain";
import { isWhatsappQueueLead, type WhatsappQueueStatus } from "./domain";

function inclusiveMadridRange(from: string, to: string) {
  const nowAfterRange = new Date(`${to}T12:00:00.000Z`);
  nowAfterRange.setUTCDate(nowAfterRange.getUTCDate() + 2);
  return normalizeMadridRange({ fromDay: from, toDay: to, now: nowAfterRange });
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
  const callerCondition = input.callerId ? eq(leads.callerId, input.callerId) : undefined;

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
      .leftJoin(user, eq(user.id, leads.callerId))
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

  return { rows, callers };
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
