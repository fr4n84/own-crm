import { z } from "zod/v4";

import { listCloserSales, updateCloserSaleRecord } from "../closer-sales/service";
import { paymentReconciliationService } from "../payment-reconciliation/service";
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
const csvText = z.string().min(1).max(2 * 1024 * 1024);
const profileId = z.string().min(1).max(100);
const reconciliationResolutions = z.array(z.object({
  externalReference: z.string().trim().min(1).max(300),
  leadId: z.string().min(1),
})).max(10_000);

export const closerSaleUpdateInput = z.object({
  leadId: z.string().min(1),
  contract: contractFile.nullable().optional(),
  salesCallUrl: nullableUrl,
  saleAmountCents: moneyCents,
  amountPaidCents: z.number().int().min(0).max(2_147_483_647),
  soldOn: calendarDay,
  paymentMethod: z.enum(["fullpay", "financed"]).nullable().default(null),
  financingProvider: z.string().trim().min(1).max(200).nullable().default(null),
  installmentMonths: z.number().int().min(1).max(600).nullable().default(null),
  financialOperationId: z.uuid(),
  onboardingCompleted: z.boolean(),
  onboardingVideoUrl: nullableUrl,
}).superRefine((value, context) => {
  const isValidLegacy = value.paymentMethod === null
    && value.financingProvider === null
    && value.installmentMonths === null;
  const isValidFullpay = value.paymentMethod === "fullpay"
    && value.financingProvider === null
    && value.installmentMonths === null;
  const isValidFinanced = value.paymentMethod === "financed"
    && value.financingProvider !== null
    && value.installmentMonths !== null;
  if (!isValidLegacy && !isValidFullpay && !isValidFinanced) {
    context.addIssue({
      code: "custom",
      message: "La forma de pago y los datos de financiación no son coherentes",
      path: ["paymentMethod"],
    });
  }
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
  reconciliationProfiles: permittedProcedure(["*"]).query(() => paymentReconciliationService.listProfiles()),
  createReconciliationProfile: permittedProcedure(["*"])
    .input(z.object({
      providerKey: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
      name: z.string().trim().min(1).max(120),
    }))
    .mutation(({ ctx, input }) => paymentReconciliationService.createProfile({ ...input, actorId: ctx.session.user.id })),
  previewReconciliation: permittedProcedure(["*"])
    .input(z.object({ profileId, csv: csvText }))
    .mutation(({ input }) => paymentReconciliationService.preview(input)),
  confirmReconciliation: permittedProcedure(["*"])
    .input(z.object({ profileId, fileName: z.string().trim().min(1).max(255), csv: csvText, resolutions: reconciliationResolutions }))
    .mutation(({ ctx, input }) => paymentReconciliationService.confirm({ ...input, actorId: ctx.session.user.id })),
  cashRealizedReport: permittedProcedure(["*"]).query(() => paymentReconciliationService.cashRealizedReport()),
});
