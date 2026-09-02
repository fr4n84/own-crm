import { router } from "../index";
import { permittedProcedure } from "@crm-fran/api/trpc/trpc";

export const authRouter = router({
  getMyPermissions: permittedProcedure([]).query(async ({ ctx }) => {
    return {
      role: ctx.role,
      permissions: ctx.permissions,
    };
  }),
});
