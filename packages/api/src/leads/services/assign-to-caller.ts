import { TRPCError } from "@trpc/server";
import { and, db, eq, inArray, isNull } from "@crm-fran/db";
import {
  leads,
  rankingEvents,
  RANKING_METRIC,
  LEAD_ACTIVITY_KIND,
  LEAD_POOL_STATUS,
} from "@crm-fran/db/schema/index";

import { hasUnworkedLead } from "./has-unworked-lead";
import { appendLeadActivity } from "./lead-activity";

/**
 * Asigna un lead a un caller para que empiece a trabajarlo.
 *
 * Regla de negocio: un caller no puede tomar un nuevo lead si ya tiene
 * otro en estado "sin asignar" (asignado pero todavía no procesado).
 * Para tomar otro, primero debe avanzar ese lead a otro estado
 * (típicamente "Asignado" al closer, vía `assignLead`).
 */
export async function assignLeadToCaller({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  return db.transaction(async (tx) => {
    const callerLeads = await tx
      .select({ state: leads.state })
      .from(leads)
      .where(eq(leads.callerId, userId));

    if (hasUnworkedLead(callerLeads)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Ya tenés un lead con el estado sin asignar",
      });
    }

    const [lead] = await tx
      .update(leads)
      .set({ callerId: userId })
      .where(
        and(
          eq(leads.id, id),
          isNull(leads.callerId),
          isNull(leads.closerId),
          inArray(leads.poolStatus, [
            LEAD_POOL_STATUS.NEW,
            LEAD_POOL_STATUS.RECOVERED,
          ]),
        ),
      )
      .returning();

    if (!lead) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "El lead ya no está disponible",
      });
    }

    await tx
      .insert(rankingEvents)
      .values({
        id: crypto.randomUUID(),
        metric: RANKING_METRIC.CALLER_LEAD_TAKEN,
        userId,
        leadId: id,
        dedupeKey: `${RANKING_METRIC.CALLER_LEAD_TAKEN}:${id}:${userId}:initial`,
      })
      .onConflictDoNothing();
    await appendLeadActivity(tx, {
      leadId: id,
      actorId: userId,
      actorRole: "caller",
      kind: LEAD_ACTIVITY_KIND.CALLER_ASSIGNED,
      title: "Caller asignado",
      description: "El caller tomó el lead",
      metadata: { userId },
      dedupeKey: `caller_assigned:${id}:${userId}:${lead.updatedAt.toISOString()}`,
    });

    return lead;
  });
}
