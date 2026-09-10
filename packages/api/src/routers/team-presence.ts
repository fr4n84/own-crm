import { TEAM_PRESENCE_CATEGORIES } from "@crm-fran/db/schema/team-presence";
import { z } from "zod";

import { router } from "../index";
import { hasPermission } from "../permissions";
import { teamPresenceService } from "../team-presence/runtime";
import { permittedProcedure } from "../trpc/trpc";

const heartbeatInput = z.object({ category: z.enum(TEAM_PRESENCE_CATEGORIES) }).strict();

export const teamPresenceRouter = router({
  heartbeat: permittedProcedure([]).input(heartbeatInput).mutation(({ ctx, input }) =>
    teamPresenceService.heartbeat({ userId: ctx.session.user.id, category: input.category }),
  ),
  list: permittedProcedure([]).query(({ ctx }) =>
    teamPresenceService.list({ includeRoles: hasPermission(ctx.permissions, ["users:read"]) }),
  ),
});
