import { and, db, eq, exists, or, type SQL } from "@crm-fran/db";
import { alerts, leads } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { hasGlobalAlertAccess } from "./alert-access-policy";

export function buildAlertAccessCondition(
  actorId: string,
  permissions: readonly Permission[],
): SQL<unknown> | undefined {
  if (hasGlobalAlertAccess(permissions)) return undefined;

  return or(
    eq(alerts.targetUserId, actorId),
    exists(
      db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.id, alerts.leadId),
            or(eq(leads.callerId, actorId), eq(leads.closerId, actorId)),
          ),
        ),
    ),
  );
}
