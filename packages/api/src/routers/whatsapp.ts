import { z } from "zod/v4";

import { madridDayKey } from "../commercial-observatory/domain";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";
import { listWhatsappQueue, markWhatsappSent } from "../whatsapp/service";

const calendarDay = z.string().date();
const listInput = z.object({
  status: z.enum(["pending", "sent"]),
  from: calendarDay,
  to: calendarDay,
  callerId: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.from > value.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "La fecha final debe ser igual o posterior a la inicial" });
  }
  if (value.to > madridDayKey(new Date())) {
    context.addIssue({ code: "custom", path: ["to"], message: "La fecha final no puede estar en el futuro" });
  }
});

export const whatsappRouter = router({
  list: permittedProcedure(["leads:read"])
    .input(listInput)
    .query(({ input }) => listWhatsappQueue(input)),
  markSent: permittedProcedure(["leads:write"])
    .input(z.object({ leadId: z.string().min(1), sent: z.boolean() }))
    .mutation(({ ctx, input }) => markWhatsappSent({
      ...input,
      actorId: ctx.session.user.id,
    })),
});
