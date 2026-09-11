import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { madridDayKey } from "../commercial-observatory/domain";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";
import { whatsappDeliveryCapability } from "../whatsapp/delivery-provider";
import {
  WhatsappConflictError,
  WhatsappNotFoundError,
  listWhatsappQueue,
  markWhatsappSent,
  whatsappService,
} from "../whatsapp/service";

const calendarDay = z.string().date();
const leadId = z.string().trim().min(1).max(200);
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
const consentInput = z.object({
  leadId,
  source: z.string().trim().min(1).max(120),
  evidence: z.string().trim().min(1).max(2_000),
  reference: z.string().trim().min(1).max(500).optional(),
  occurredAt: z.coerce.date(),
});

async function mapWhatsappError<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof WhatsappNotFoundError) {
      throw new TRPCError({ code: "NOT_FOUND", message: error.message });
    }
    if (error instanceof WhatsappConflictError) {
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    }
    throw error;
  }
}

export const whatsappRouter = router({
  deliveryCapability: permittedProcedure(["leads:read"])
    .query(() => whatsappDeliveryCapability()),
  list: permittedProcedure(["leads:read"])
    .input(listInput)
    .query(({ input }) => listWhatsappQueue(input)),
  markSent: permittedProcedure(["leads:write"])
    .input(z.object({ leadId, sent: z.boolean() }))
    .mutation(({ ctx, input }) => markWhatsappSent({
      ...input,
      actorId: ctx.session.user.id,
    })),
  recordConsent: permittedProcedure(["leads:write"])
    .input(consentInput)
    .mutation(({ ctx, input }) => mapWhatsappError(() => whatsappService.recordConsent({
      ...input,
      actorId: ctx.session.user.id,
    }))),
  revokeConsent: permittedProcedure(["leads:write"])
    .input(consentInput)
    .mutation(({ ctx, input }) => mapWhatsappError(() => whatsappService.revokeConsent({
      ...input,
      actorId: ctx.session.user.id,
    }))),
  generateDraft: permittedProcedure(["leads:write"])
    .input(z.object({ leadId }))
    .mutation(({ ctx, input }) => mapWhatsappError(() => whatsappService.generateDraft({
      ...input,
      actorId: ctx.session.user.id,
    }))),
  submitForApproval: permittedProcedure(["leads:write"])
    .input(z.object({
      leadId,
      bodyText: z.string().trim().min(1).max(4_000),
      origin: z.enum(["manual", "ai"]),
      contextHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      idempotencyKey: z.uuid(),
    }))
    .mutation(({ ctx, input }) => mapWhatsappError(() => whatsappService.submitForApproval({
      ...input,
      actorId: ctx.session.user.id,
    }))),
  approveMessage: permittedProcedure(["leads:write"])
    .input(z.object({ messageId: z.uuid() }))
    .mutation(({ ctx, input }) => mapWhatsappError(() => whatsappService.approveMessage({
      ...input,
      actorId: ctx.session.user.id,
    }))),
});
