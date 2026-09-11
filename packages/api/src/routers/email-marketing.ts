import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { MOTIVATION_ANGLES, type MotivationAngle } from "../call-feedback";
import { emailMarketingDeliveryCapability } from "../email-marketing/delivery-provider";
import { EmailMarketingConflictError, EmailMarketingNotFoundError, emailMarketingService } from "../email-marketing/service";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const adminProcedure = permittedProcedure(["*"]);
const email = z.email().max(320);
const source = z.string().trim().min(1).max(120);
const evidence = z.string().trim().min(1).max(2_000);
const reference = z.string().trim().min(1).max(500).optional();
const MAX_AUTHORITY_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const occurredAt = z.date().refine((value) => value.getTime() <= Date.now() + MAX_AUTHORITY_CLOCK_SKEW_MS, {
  message: "Authority evidence cannot be dated more than five minutes in the future",
});
const auditInput = z.object({ email, leadId: z.string().min(1).max(100).optional(), source, evidence, reference, occurredAt });
const suppressionInput = auditInput.extend({ reason: z.string().trim().min(1).max(500) });
const campaignId = z.uuid();
const segmentValue = z.string().trim().min(1).max(300);
const motivationAngleValues = MOTIVATION_ANGLES.map((angle) => angle.value) as [MotivationAngle, ...MotivationAngle[]];
const confirmedFeedback = z.enum(motivationAngleValues);
const segmentGroup = z.object({
  sources: z.array(segmentValue).max(20).optional(),
  campaigns: z.array(segmentValue).max(20).optional(),
  utmContents: z.array(segmentValue).max(20).optional(),
  themes: z.array(segmentValue).max(20).optional(),
  confirmedFeedback: z.array(confirmedFeedback).max(6).optional(),
}).strict();
const segmentCriteria = z.object({
  combine: z.enum(["union", "intersection", "exclusion"]),
  groups: z.array(segmentGroup).min(1).max(10),
}).strict();

async function mapServiceError<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof EmailMarketingNotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: error.message });
    if (error instanceof EmailMarketingConflictError) throw new TRPCError({ code: "CONFLICT", message: error.message });
    throw error;
  }
}

export const emailMarketingRouter = router({
  deliveryCapability: adminProcedure.query(() => emailMarketingDeliveryCapability()),
  listCampaigns: adminProcedure.query(() => emailMarketingService.listCampaigns()),
  permissionSummary: adminProcedure.query(() => emailMarketingService.permissionSummary()),
  recordConsent: adminProcedure.input(auditInput).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.recordConsent({ ...input, actorId: ctx.session.user.id }))),
  revokeConsent: adminProcedure.input(auditInput).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.revokeConsent({ ...input, actorId: ctx.session.user.id }))),
  suppress: adminProcedure.input(suppressionInput).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.suppress({ ...input, actorId: ctx.session.user.id }))),
  liftSuppression: adminProcedure.input(suppressionInput).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.liftSuppression({ ...input, actorId: ctx.session.user.id }))),
  createCampaign: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(160) })).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.createCampaign({ ...input, actorId: ctx.session.user.id }))),
  buildAudience: adminProcedure.input(z.object({ campaignId, criteria: segmentCriteria.optional() })).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.buildAudience({ ...input, actorId: ctx.session.user.id }))),
  listAudienceMembers: adminProcedure.input(z.object({
    snapshotId: z.uuid(),
    cursor: z.string().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  })).query(({ input }) => mapServiceError(() => emailMarketingService.listAudienceMembers(input))),
  exportAudience: adminProcedure.input(z.object({
    snapshotId: z.uuid(),
    purpose: z.string().trim().min(1).max(500),
    operationId: z.uuid(),
  })).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.exportAudience({ ...input, actorId: ctx.session.user.id }))),
  addCopyVersion: adminProcedure.input(z.object({
    campaignId, subject: z.string().trim().min(1).max(250), previewText: z.string().trim().max(500).optional(), bodyText: z.string().trim().min(1).max(100_000),
  })).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.addCopyVersion({ ...input, actorId: ctx.session.user.id }))),
  generateCopyDraft: adminProcedure.input(z.object({ campaignId })).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.generateCopyDraft({ ...input, actorId: ctx.session.user.id }))),
  approveCopyVersion: adminProcedure.input(z.object({ campaignId, contentVersionId: z.uuid() })).mutation(({ ctx, input }) => mapServiceError(() => emailMarketingService.approveCopyVersion({ ...input, actorId: ctx.session.user.id }))),
  explainContact: adminProcedure.input(z.object({ campaignId, email })).query(({ input }) => mapServiceError(() => emailMarketingService.explainContact(input))),
});
