import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  createPersonalGoal,
  deletePersonalGoal,
  listPersonalGoals,
  updatePersonalGoal,
} from "../personal-goals/service";

const goalFields = z
  .object({
    metric: z.enum([
      "contacted",
      "shows",
      "appointments",
      "appointment_rate",
      "assigned",
      "future_calls",
    ]),
    targetValue: z.number().int().positive(),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "La fecha final debe ser igual o posterior a la inicial",
    path: ["endDate"],
  })
  .refine(
    (value) => value.metric !== "appointment_rate" || value.targetValue <= 100,
    { message: "El porcentaje no puede superar 100", path: ["targetValue"] },
  );

function assertMetricAllowed(roleId: string | undefined, metric: string) {
  if (roleId === "role-closer" && metric !== "shows") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Los closers solo pueden crear objetivos de Shows",
    });
  }
}

export const personalGoalsRouter = router({
  list: protectedProcedure
    .input(z.object({ userId: z.string().min(1).optional() }).optional())
    .query(({ ctx, input }) => {
      const requestedUserId = input?.userId ?? ctx.session.user.id;
      if (
        requestedUserId !== ctx.session.user.id &&
        !ctx.permissions?.includes("*")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return listPersonalGoals(requestedUserId);
    }),
  create: protectedProcedure.input(goalFields).mutation(({ ctx, input }) => {
    assertMetricAllowed(ctx.session.user.roleId, input.metric);
    return createPersonalGoal(ctx.session.user.id, input);
  }),
  update: protectedProcedure
    .input(z.object({ id: z.string().min(1), goal: goalFields }))
    .mutation(({ ctx, input }) => {
      assertMetricAllowed(ctx.session.user.roleId, input.goal.metric);
      return updatePersonalGoal(ctx.session.user.id, input.id, input.goal);
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      deletePersonalGoal(ctx.session.user.id, input.id),
    ),
});
