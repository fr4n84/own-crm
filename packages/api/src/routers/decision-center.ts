import { z } from "zod";

import { decisionCenterService } from "../decision-center/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

export const decisionTransitionInput = z.object({
  decisionId: z.string().min(1),
  action: z.enum(["approve", "reject", "start", "complete"]),
  note: z.string().trim().min(1).max(1_000).optional(),
});

const admin = permittedProcedure(["*"]);

export const decisionCenterRouter = router({
  weekly: admin.query(() => decisionCenterService.weekly()),
  transition: admin
    .input(decisionTransitionInput)
    .mutation(({ ctx, input }) =>
      decisionCenterService.transition({
        ...input,
        actorId: ctx.session.user.id,
      }),
    ),
});
