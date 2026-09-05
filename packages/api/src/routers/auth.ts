import { getNavigationVisibility } from "../users/services/navigation-visibility";
import { passwordRecoveryInput, redeemPasswordResetCode, PasswordRecoveryError } from "@crm-fran/auth/password-recovery";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../index";
import { permittedProcedure } from "@crm-fran/api/trpc/trpc";

export const authRouter = router({
  getMyAccess: permittedProcedure([]).query(async ({ ctx }) => ({ role: ctx.role, permissions: ctx.permissions, navigation: await getNavigationVisibility() })),
  redeemPasswordReset: publicProcedure.input(passwordRecoveryInput).mutation(async ({ input }) => {
    try { return await redeemPasswordResetCode(input); }
    catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof PasswordRecoveryError ? "Código inválido o caducado" : "No se pudo restablecer la contraseña. Inténtalo de nuevo." }); }
  }),
  getMyPermissions: permittedProcedure([]).query(async ({ ctx }) => {
    return {
      role: ctx.role,
      permissions: ctx.permissions,
    };
  }),
});
