import { z } from "zod";

import { permittedProcedure } from "../trpc/trpc";
import { protectedProcedure, router } from "../index";
import { getRankings, updateRankingSettings } from "../rankings/ranking-service";

const settingsInput = z.object({
  callerLeadTakenPoints: z.number().int().min(0).max(1000),
  callerAppointmentPoints: z.number().int().min(0).max(1000),
  callerShowPoints: z.number().int().min(0).max(1000),
  closerSalePoints: z.number().int().min(0).max(1000),
  closerFollowUpShowPoints: z.number().int().min(0).max(1000),
});

export const rankingsRouter = router({
  get: protectedProcedure
    .input(z.object({ period: z.enum(["week", "fortnight", "month"]) }))
    .query(({ input }) => getRankings(input.period)),
  updateSettings: permittedProcedure(["settings:write"])
    .input(settingsInput)
    .mutation(({ ctx, input }) => updateRankingSettings(ctx.session.user.id, input)),
});
