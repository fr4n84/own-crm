import { TRPCError } from "@trpc/server";
import type { Permission } from "@crm-fran/db/schema/auth";
import { hasPermission } from "../permissions";
import { getNavigationVisibility } from "../users/services/navigation-visibility";

export async function assertObservatoryAccess(roleId: string | null | undefined, permissions: readonly Permission[]) {
 if (permissions.includes("*")) return;
 if (!roleId || !hasPermission([...permissions], ["leads:read"])) throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso al Observatorio comercial" });
 const configuration=await getNavigationVisibility();
 const configuredRoles=configuration.configured ? configuration.roleIdsByModule["commercial-observatory"] : undefined;
 const allowed=configuredRoles ? configuredRoles.includes(roleId) : roleId !== "role-caller" && roleId !== "role-closer";
 if(!allowed) throw new TRPCError({code:"FORBIDDEN",message:"No tienes acceso al Observatorio comercial"});
}
