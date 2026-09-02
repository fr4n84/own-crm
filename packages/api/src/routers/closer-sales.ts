import { z } from "zod/v4";

import { listCloserSales, updateCloserSaleRecord } from "../closer-sales/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const httpUrl = z.url().max(2_000).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "La URL debe usar HTTP o HTTPS");
const nullableUrl = z.union([httpUrl, z.null()]);
const contractFile = z.object({
  storageKey: z.string().regex(/^[0-9a-f-]{36}\.(?:pdf|doc|docx|jpg|jpeg|png|webp)$/),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
});
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}, "Fecha inválida");
const moneyCents = z.number().int().positive().max(2_147_483_647);

export const closerSaleUpdateInput = z.object({
  leadId: z.string().min(1),
  contract: contractFile.nullable().optional(),
  salesCallUrl: nullableUrl,
  saleAmountCents: moneyCents,
  amountPaidCents: z.number().int().min(0).max(2_147_483_647),
  soldOn: calendarDay,
  financialOperationId: z.uuid(),
  onboardingCompleted: z.boolean(),
  onboardingVideoUrl: nullableUrl,
}).refine((value) => value.amountPaidCents <= value.saleAmountCents, {
  message: "El importe cobrado no puede superar el importe de la venta",
  path: ["amountPaidCents"],
});

export const closerSalesRouter = router({
  list: permittedProcedure(["sales:read"]).query(() => listCloserSales()),
  update: permittedProcedure(["sales:write"])
    .input(closerSaleUpdateInput)
    .mutation(({ ctx, input }) => updateCloserSaleRecord({
      ...input,
      currency: "EUR",
      soldAt: new Date(`${input.soldOn}T12:00:00.000Z`),
      actorId: ctx.session.user.id,
    })),
});
