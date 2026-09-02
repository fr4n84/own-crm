import type { PermissionState } from "@crm-fran/ui/permissions";

export type AdminPageAccess = "loading" | "error" | "denied" | "granted";

export function resolveAdminPageAccess(state: Pick<PermissionState, "permissions" | "isLoaded" | "isLoading" | "error">): AdminPageAccess {
  if (state.isLoading || state.isLoaded === false) return "loading";
  if (state.error) return "error";
  return state.permissions.includes("*") ? "granted" : "denied";
}
