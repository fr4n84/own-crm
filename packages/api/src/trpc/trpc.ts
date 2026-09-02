import { t } from "../index";
import { TRPCError } from "@trpc/server";
import { hasPermission } from "../permissions";
import type { Permission } from "@crm-fran/db/schema/auth";

export const permittedProcedure = (
  permissionRequired: Permission[],
) => {
  return t.procedure.use(({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        cause: "No session",
      });
    }

    if (!ctx.permissions) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No permission level assigned",
        cause: "User has no role",
      });
    }

    if (!hasPermission(ctx.permissions, permissionRequired)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Permission denied",
        cause: "User does not have required permission",
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
      },
    });
  });
};
