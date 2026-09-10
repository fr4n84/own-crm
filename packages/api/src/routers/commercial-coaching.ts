import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { coachingAnalysisDraftSchema } from "../commercial-coaching/domain";
import { listCoachingAnalyses, listCoachingCohorts, reviewCoachingAnalysis } from "../commercial-coaching/service";

export const commercialCoachingRouter = router({
  list: protectedProcedure.input(z.object({ targetUserId: z.string().min(1).optional() }).optional()).query(({ ctx, input }) => listCoachingAnalyses({ actorId: ctx.session.user.id, targetUserId: input?.targetUserId, permissions: ctx.permissions })),
  review: protectedProcedure.input(z.object({ id: z.string().min(1), decision: z.enum(["confirmed", "discarded"]), draft: coachingAnalysisDraftSchema.optional() })).mutation(({ ctx, input }) => reviewCoachingAnalysis({ ...input, actorId: ctx.session.user.id, permissions: ctx.permissions })),
  cohorts: protectedProcedure.query(({ ctx }) => listCoachingCohorts({ permissions: ctx.permissions })),
});
