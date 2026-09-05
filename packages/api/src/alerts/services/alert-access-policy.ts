import type { Permission } from "@crm-fran/db/schema/auth";

type AlertAccessRecord = {
  targetUserId: string | null;
  lead: { callerId: string | null; closerId: string | null } | null;
};

export function hasGlobalAlertAccess(permissions: readonly Permission[]) {
  return permissions.includes("*");
}

export function canAccessAlertRecord(
  alert: AlertAccessRecord,
  actorId: string,
  permissions: readonly Permission[],
) {
  return hasGlobalAlertAccess(permissions)
    || alert.targetUserId === actorId
    || alert.lead?.callerId === actorId
    || alert.lead?.closerId === actorId;
}
