import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";
import { competitorAdRepository } from "../competitor-ads/repository";
import { assertObservatoryAccess } from "../commercial-observatory/access";

function requireAdmin(permissions: readonly string[]) {
  if (!permissions.includes("*")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

const country = z.string().regex(/^[A-Z]{2}$/);
const sourceInput = z.object({
  id: z.uuid().optional(),
  metaPageId: z.string().regex(/^\d{1,64}$/),
  displayName: z.string().trim().min(1).max(200),
  countries: z.array(country).min(1).max(25).default(["ES"]),
  enabled: z.boolean().default(true),
});

export const competitorAdsRouter = router({
  overview: permittedProcedure(["leads:read"]).input(z.object({
    adLimit: z.number().int().min(1).max(100).default(50),
    runLimit: z.number().int().min(1).max(50).default(20),
  }).optional()).query(async ({ ctx, input }) => {
    await assertObservatoryAccess(ctx.role?.id, ctx.permissions);
    return competitorAdRepository.getOverview(input?.adLimit ?? 50, input?.runLimit ?? 20);
  }),
  listSources: permittedProcedure(["users:read"]).query(({ ctx }) => {
    requireAdmin(ctx.permissions);
    return competitorAdRepository.listSources();
  }),
  saveSource: permittedProcedure(["users:write"]).input(sourceInput).mutation(({ ctx, input }) => {
    requireAdmin(ctx.permissions);
    return competitorAdRepository.upsertSource({
      ...input,
      countries: [...new Set(input.countries)].sort(),
      actorId: ctx.session.user.id,
      now: new Date(),
    });
  }),
  setSourceEnabled: permittedProcedure(["users:write"]).input(z.object({
    id: z.uuid(),
    enabled: z.boolean(),
  })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.permissions);
    const updated = await competitorAdRepository.setSourceEnabled({ ...input, now: new Date() });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Competitor source not found" });
    return { updated: true };
  }),
  recentRuns: permittedProcedure(["users:read"]).input(z.object({
    limit: z.number().int().min(1).max(100).default(20),
  }).optional()).query(({ ctx, input }) => {
    requireAdmin(ctx.permissions);
    return competitorAdRepository.listRecentRuns(input?.limit ?? 20);
  }),
});
