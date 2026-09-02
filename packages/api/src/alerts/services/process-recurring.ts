import { and, db, eq, isNull, lt, lte, or, sql } from "@crm-fran/db";
import {
  alerts,
  ALERT_KIND,
  leads,
  LEAD_ACTIVITY_KIND,
  LEAD_POOL_STATUS,
  LEAD_STATE,
} from "@crm-fran/db/schema/index";

import { appendLeadActivity } from "../../leads/services/lead-activity";
import {
  getLeadRecoveryTransition,
  isRecoverableNoContactAlert,
} from "../lead-recovery";

export async function processRecurringAlerts(now: Date = new Date(), userId?: string) {
  return db.transaction(async (tx) => {
    const dueAlerts = await tx
      .select({
        id: alerts.id,
        leadId: alerts.leadId,
        kind: alerts.kind,
        nextShowAt: alerts.nextShowAt,
        resolvedAt: alerts.resolvedAt,
        dismissedAt: alerts.dismissedAt,
        targetUserId: alerts.targetUserId,
        callerId: leads.callerId,
        closerId: leads.closerId,
        poolStatus: leads.poolStatus,
        noContactImpactCount: leads.noContactImpactCount,
      })
      .from(alerts)
      .innerJoin(leads, eq(leads.id, alerts.leadId))
      .where(
        and(
          lte(alerts.nextShowAt, now),
          isNull(alerts.resolvedAt),
          isNull(alerts.dismissedAt),
          isNull(alerts.expiredAt),
          or(
            eq(alerts.kind, ALERT_KIND.NO_CONTACT),
            isNull(alerts.maxOccurrences),
            lt(alerts.occurrences, alerts.maxOccurrences),
          ),
          userId ? eq(alerts.targetUserId, userId) : undefined,
        ),
      )
      .for("update", { skipLocked: true });

    for (const dueAlert of dueAlerts) {
      if (dueAlert.kind === ALERT_KIND.NO_CONTACT) {
        const canRecover = isRecoverableNoContactAlert(
          dueAlert,
          {
            callerId: dueAlert.callerId,
            closerId: dueAlert.closerId,
            poolStatus: dueAlert.poolStatus,
          },
          now,
        );
        const transition = canRecover
          ? getLeadRecoveryTransition(dueAlert.noContactImpactCount)
          : null;

        await tx
          .update(alerts)
          .set({
            expiredAt: now,
            occurrences: sql`${alerts.occurrences} + 1`,
          })
          .where(and(eq(alerts.id, dueAlert.id), isNull(alerts.expiredAt)));

        if (!transition) continue;

        await tx
          .update(leads)
          .set({
            callerId: null,
            state: LEAD_STATE.SIN_ASIGNAR,
            poolStatus: transition.poolStatus,
            noContactImpactCount: transition.impactCount,
            updatedAt: now,
          })
          .where(
            and(
              eq(leads.id, dueAlert.leadId),
              eq(leads.callerId, dueAlert.targetUserId ?? ""),
            ),
          );

        const discarded = transition.poolStatus === LEAD_POOL_STATUS.DISCARDED;
        await appendLeadActivity(tx, {
          leadId: dueAlert.leadId,
          kind: discarded
            ? LEAD_ACTIVITY_KIND.LEAD_DISCARDED
            : LEAD_ACTIVITY_KIND.LEAD_RECOVERED,
          title: discarded ? "Lead descartado" : "Lead disponible para recuperar",
          description: discarded
            ? "Tercer intento de contacto vencido sin resolución"
            : `Intento ${transition.impactCount} de 3 vencido sin resolución`,
          metadata: {
            alertId: dueAlert.id,
            previousCallerId: dueAlert.targetUserId,
            impactCount: transition.impactCount,
            poolStatus: transition.poolStatus,
          },
          dedupeKey: `lead_recovery:${dueAlert.id}`,
          occurredAt: now,
        });
        continue;
      }

      await tx
        .update(alerts)
        .set({
          occurrences: sql`${alerts.occurrences} + 1`,
          nextShowAt: sql`${alerts.nextShowAt} + (${alerts.intervalMinutes} * interval '1 minute')`,
        })
        .where(eq(alerts.id, dueAlert.id));
    }

    return dueAlerts.length;
  });
}
