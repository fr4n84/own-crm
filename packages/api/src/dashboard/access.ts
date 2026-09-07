import { TRPCError } from "@trpc/server";

import type { Permission } from "@crm-fran/db/schema/auth";

import { hasPermission } from "../permissions";
import { getNavigationVisibility } from "../users/services/navigation-visibility";

export async function assertDashboardAccess(
  roleId: string | null | undefined,
  permissions: readonly Permission[],
) {
  if (!roleId || !hasPermission([...permissions], ["leads:read"])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso al Dashboard" });
  }

  const configuration = await getNavigationVisibility();
  const configuredRoles = configuration.configured
    ? configuration.roleIdsByModule.dashboard
    : undefined;

  if (configuredRoles !== undefined && !configuredRoles.includes(roleId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso al Dashboard" });
  }
}
