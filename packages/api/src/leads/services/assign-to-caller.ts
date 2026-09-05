import { TRPCError } from "@trpc/server";
import { and, db, eq, inArray, isNull, sql } from "@crm-fran/db";
import {
  FEATURE_ACTIVATION,
  featureActivations,
  leads,
  rankingEvents,
  RANKING_METRIC,
  LEAD_ACTIVITY_KIND,
  LEAD_POOL_STATUS,
  user,
} from "@crm-fran/db/schema/index";

import { hasUnworkedLead } from "./has-unworked-lead";
import { appendLeadActivity } from "./lead-activity";

/**
 * Asigna un lead a un caller para que empiece a trabajarlo.
 *
 * Regla de negocio: desde la activación persistida, un caller no puede tomar
 * un nuevo lead si ya tiene otro de esa época en estado "sin asignar".
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
    const [lockedUser] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");

    if (!lockedUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "La sesión ya no corresponde a un usuario activo",
      });
    }

    const [activation] = await tx
      .select({ activatedAt: featureActivations.activatedAt })
      .from(featureActivations)
      .where(
        eq(
          featureActivations.key,
          FEATURE_ACTIVATION.CALLER_SINGLE_UNWORKED_LEAD,
        ),
      )
      .limit(1);

    if (!activation) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "La política de asignación todavía no está activada",
      });
    }

    const callerLeads = await tx
      .select({
        state: leads.state,
        callerAssignedAt: leads.callerAssignedAt,
      })
      .from(leads)
      .where(eq(leads.callerId, userId));

    if (hasUnworkedLead(callerLeads, activation.activatedAt)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Completa el lead actual antes de asignarte el siguiente",
      });
    }

    const [lead] = await tx
      .update(leads)
      .set({
        callerId: userId,
        callerAssignedAt: sql`transaction_timestamp()`,
      })
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
