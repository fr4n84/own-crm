import { COMMERCIAL_ROLE_IDS, ROLE_ID } from "@crm-fran/db/schema/auth";
import { APIError } from "better-auth/api";

export const userRoleHooks = {
  create: {
    before: async (data: Record<string, unknown>) => {
      const roleId = data.roleId === undefined ? ROLE_ID.CALLER : data.roleId;
      if (typeof roleId !== "string" || !COMMERCIAL_ROLE_IDS.some((allowed) => allowed === roleId)) {
        throw new APIError("BAD_REQUEST", { message: "Choose Caller, Closer or Hybrid" });
      }
      return { data: { ...data, roleId } };
    },
  },
  update: {
    before: async (data: Record<string, unknown>) => {
      // Role changes belong to the authorized CRM endpoint, never profile updates.
      if (Object.hasOwn(data, "roleId")) {
        throw new APIError("FORBIDDEN", { message: "Role changes require an administrator" });
      }
      return { data };
    },
  },
};
