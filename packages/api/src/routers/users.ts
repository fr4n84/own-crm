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
