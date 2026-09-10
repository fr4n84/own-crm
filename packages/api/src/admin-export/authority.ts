import type { Permission } from "@crm-fran/db/schema/auth";
import { TRPCError } from "@trpc/server";

import { hasPermission } from "../permissions";

export type AdminExportAuthority = {
  actorId: string;
  permissions: readonly Permission[];
};

export function assertAdminExportAuthority(authority: AdminExportAuthority) {
  if (!authority.actorId || !hasPermission([...authority.permissions], ["*"])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin export permission required." });
  }
  return authority;
}
