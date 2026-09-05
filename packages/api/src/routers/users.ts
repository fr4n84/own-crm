import { issuePasswordResetCode, PasswordRecoveryError } from "@crm-fran/auth/password-recovery";
import { and, db, eq } from "@crm-fran/db";
import { COMMERCIAL_ROLE_IDS, user } from "@crm-fran/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../index";
import { permittedProcedure } from "@crm-fran/api/trpc/trpc";
import { listClosers } from "../users/services/list-closers";
import { listUserAccess } from "../users/services/list-user-access";
import { getNavigationVisibility, updateNavigationVisibility } from "../users/services/navigation-visibility";
import { NAVIGATION_MODULE_IDS } from "../navigation-visibility";
import { protectedProcedure } from "../index";

const accessDirectoryInput = z.object({
  search: z.string().trim().max(120).optional(),
  roleId: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["verified", "pending"]).optional(),
}).optional();

const navigationVisibilityInput = z.object({
  expectedVersion: z.number().int().nonnegative(),
  entries: z.array(z.object({
    moduleId: z.enum(NAVIGATION_MODULE_IDS),
    roleIds: z.array(z.string().trim().min(1).max(120)).max(100),
  })).length(NAVIGATION_MODULE_IDS.length),
});

export const usersRouter = router({
  issuePasswordResetCode: permittedProcedure(["*"]).input(z.object({ userId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      try { return await issuePasswordResetCode(ctx.session.user.id, input.userId); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof PasswordRecoveryError ? error.message : "No se pudo generar el código. Inténtalo de nuevo." }); }
    }),
  updateCommercialRole: permittedProcedure(["*"])
    .input(z.object({
      userId: z.string().trim().min(1),
      expectedRoleId: z.enum(COMMERCIAL_ROLE_IDS),
      roleId: z.enum(COMMERCIAL_ROLE_IDS),
    }))
    .mutation(async ({ input }) => {
      const [updated] = await db.update(user)
        .set({ roleId: input.roleId })
        .where(and(eq(user.id, input.userId), eq(user.roleId, input.expectedRoleId)))
        .returning({ id: user.id, roleId: user.roleId });
      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "User role changed or cannot be edited. Refresh and try again." });
      }
      return updated;
    }),
	listClosers: permittedProcedure(["users:read"])
		.input(z.object({}).optional())
		.query(async () => {
			return await listClosers();
		}),
	accessDirectory: permittedProcedure(["*"])
		.input(accessDirectoryInput)
		.query(({ input }) => listUserAccess(input ?? {})),
	navigationVisibility: protectedProcedure.query(() => getNavigationVisibility()),
	updateNavigationVisibility: permittedProcedure(["*"])
		.input(navigationVisibilityInput)
		.mutation(({ ctx, input }) => updateNavigationVisibility({ actorId: ctx.session.user.id, ...input })),
});
