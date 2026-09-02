import { z } from "zod";

import { commercialPlaybooksRepository } from "../commercial-playbooks/runtime";
import { createCommercialPlaybooksService } from "../commercial-playbooks/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

export const commercialPlaybookGenerateInput = z.object({ candidateKey: z.string().trim().min(1).max(160) }).strict();
export const commercialPlaybookEditInput = z.object({
  lineageKey: z.string().trim().min(1).max(160), expectedVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(20_000), changeSummary: z.string().trim().min(1).max(2_000),
}).strict();
const decisionInput = z.object({ lineageKey: z.string().trim().min(1).max(160), expectedVersion: z.number().int().min(1), decisionReason: z.string().trim().min(1).max(2_000) }).strict();
export const commercialPlaybookRollbackInput = z.object({
  libraryLineageKey: z.string().trim().min(1).max(160), expectedCurrentVersion: z.number().int().min(1),
  restoreVersionId: z.string().trim().min(1).max(160), decisionReason: z.string().trim().min(1).max(2_000),
}).strict();

const service = createCommercialPlaybooksService(commercialPlaybooksRepository);
const admin = permittedProcedure(["*"]);
const actor = (ctx: { session: { user: { id: string } }; permissions: readonly string[] }) => ({ actorId: ctx.session.user.id, permissions: ctx.permissions });

export const commercialPlaybooksRouter = router({
  overview: admin.query(({ ctx }) => service.overview(actor(ctx))),
  generate: admin.input(commercialPlaybookGenerateInput).mutation(({ ctx, input }) => service.generate({ ...actor(ctx), ...input })),
  edit: admin.input(commercialPlaybookEditInput).mutation(({ ctx, input }) => service.edit({ ...actor(ctx), ...input })),
  approve: admin.input(decisionInput).mutation(({ ctx, input }) => service.approve({ ...actor(ctx), ...input })),
  reject: admin.input(decisionInput).mutation(({ ctx, input }) => service.reject({ ...actor(ctx), ...input })),
  rollback: admin.input(commercialPlaybookRollbackInput).mutation(({ ctx, input }) => service.rollback({ ...actor(ctx), ...input })),
  history: admin.input(z.object({ lineageKey: z.string().trim().min(1).max(160).optional() }).strict().optional()).query(({ ctx, input }) => service.history({ ...actor(ctx), lineageKey: input?.lineageKey })),
});
