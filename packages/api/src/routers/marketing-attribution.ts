import { z } from "zod";

import { analyzeMarketingTranscript } from "../marketing-attribution/runtime";
import { marketingAttributionService } from "../marketing-attribution/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const calendarDay = z.string().date();
const optionalText = z.string().trim().max(5_000).nullable().optional();

const mediaMetadata = z.object({
  storageKey: z.string().trim().min(1).max(180),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});

const aiAnalysis = z.object({
  angleSuggestion: z.string().trim().max(500).nullable().optional(),
  hook: z.string().trim().max(2_000).nullable().optional(),
  promise: z.string().trim().max(2_000).nullable().optional(),
  cta: z.string().trim().max(1_000).nullable().optional(),
  targetProfile: z.string().trim().max(500).nullable().optional(),
  objections: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  awarenessStage: z.string().trim().max(500).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  model: z.string().trim().max(120).optional(),
  analyzedAt: z.string().datetime().optional(),
});

export const saveMarketingMappingInput = z
  .object({
    ruleLineageKey: z.string().uuid().optional(),
    creativeLineageKey: z.string().uuid().optional(),
    leadSource: z.string().trim().max(200).nullable().optional(),
    utmContent: z.string().trim().min(1).max(300),
    validFrom: calendarDay.nullable().optional(),
    validTo: calendarDay.nullable().optional(),
    campaignSource: z.string().trim().min(1).max(200),
    campaignName: z.string().trim().min(1).max(300),
    campaignExternalId: z.string().trim().max(300).nullable().optional(),
    creativeName: z.string().trim().min(1).max(300),
    creativeFormat: z.enum(["video", "image", "audio", "text", "other"]),
    media: mediaMetadata.nullable().optional(),
    transcript: z.string().trim().max(100_000).nullable().optional(),
    angleName: z.string().trim().max(300).nullable().optional(),
    angleDescription: z.string().trim().max(5_000).nullable().optional(),
    hook: optionalText,
    promise: optionalText,
    cta: optionalText,
    targetProfile: z.string().trim().max(500).nullable().optional(),
    objections: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    awarenessStage: z.string().trim().max(500).nullable().optional(),
    aiAnalysis: aiAnalysis.optional(),
    reprocessExisting: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.validFrom && value.validTo && value.validFrom > value.validTo) {
      context.addIssue({
        code: "custom",
        path: ["validTo"],
        message: "El final de vigencia no puede ser anterior al inicio.",
      });
    }
  });

export const analyzeMarketingTranscriptInput = z.object({
  transcript: z.string().trim().min(40).max(100_000),
});

const startOfDay = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
const endOfDay = (value: string | null | undefined) =>
  value ? new Date(`${value}T23:59:59.999Z`) : null;
const admin = permittedProcedure(["*"]);

export const marketingAttributionRouter = router({
  overview: admin.query(() => marketingAttributionService.overview()),
  saveMapping: admin
    .input(saveMarketingMappingInput)
    .mutation(({ ctx, input }) =>
      marketingAttributionService.saveMapping({
        ...input,
        validFrom: startOfDay(input.validFrom),
        validTo: endOfDay(input.validTo),
        actorId: ctx.session.user.id,
      }),
    ),
  analyzeTranscript: admin
    .input(analyzeMarketingTranscriptInput)
    .mutation(({ input }) => analyzeMarketingTranscript(input.transcript)),
  archiveMapping: admin
    .input(z.object({ lineageKey: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      marketingAttributionService.archiveMapping({
        ...input,
        actorId: ctx.session.user.id,
      }),
    ),
  resolvePending: admin.mutation(({ ctx }) =>
    marketingAttributionService.resolvePending({ actorId: ctx.session.user.id }),
  ),
});
