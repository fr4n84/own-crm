import { z } from "zod";

import { getCommercialIntelligence } from "../commercial-intelligence/service";
import { getObjectionMotivationIntelligence } from "../commercial-intelligence/objection-service";
import { archiveLibraryVersion, createLibraryDraft, listLibraryVersions, publishLibraryVersion } from "../commercial-library/service";
import { normalizeMadridRange } from "../commercial-observatory/domain";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).superRefine((value, context) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year ?? 0, (month ?? 1) - 1, day ?? 0);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== (month ?? 1) - 1 || parsed.getDate() !== day) {
    context.addIssue({ code: "custom", message: "Fecha de calendario inválida" });
  }
});
const commercialDateRangeInput = z.object({ from: date, to: date }).refine((value) => value.from <= value.to, { message: "La fecha final no puede ser anterior", path: ["to"] });
export const commercialIntelligenceInput = z.object({ from: date, to: date, referenceSaleValue: z.number().nonnegative().optional() }).refine((value) => value.from <= value.to, { message: "La fecha final no puede ser anterior", path: ["to"] });
function day(value: string, end = false) { const [year, month, day] = value.split("-").map(Number); return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0); }

export function commercialIntelligenceObjectionRange(fromDay: string, toDay: string) {
  const nowAfterRequestedRange = new Date(Date.parse(`${toDay}T12:00:00.000Z`) + 2 * 24 * 60 * 60 * 1000);
  return normalizeMadridRange({ fromDay, toDay, now: nowAfterRequestedRange });
}

export const commercialIntelligenceRouter = router({
  overview: permittedProcedure(["leads:read"]).input(commercialIntelligenceInput).query(({ ctx, input }) => getCommercialIntelligence({ actorId: ctx.session.user.id, permissions: ctx.permissions, from: day(input.from), to: day(input.to, true), referenceSaleValue: input.referenceSaleValue })),
  objections: permittedProcedure(["leads:read"]).input(commercialDateRangeInput).query(({ ctx, input }) => {
    const range = commercialIntelligenceObjectionRange(input.from, input.to);
    return getObjectionMotivationIntelligence({ from: range.from, to: range.to, actorId: ctx.permissions.includes("*") ? null : ctx.session.user.id });
  }),
  library: permittedProcedure(["leads:read"]).input(z.object({ leadId: z.string().min(1).optional(), adminTargeting: z.object({ profile: z.string().nullable().optional(), source: z.string().nullable().optional(), campaign: z.string().nullable().optional(), ad: z.string().nullable().optional(), creative: z.string().nullable().optional(), acquisitionAngle: z.string().nullable().optional(), objections: z.array(z.string()).optional(), motivations: z.array(z.string()).optional() }).optional() }).optional()).query(({ ctx, input }) => listLibraryVersions({ admin: ctx.permissions.includes("*"), actorId: ctx.session.user.id, leadId: input?.leadId, adminTargeting: input?.adminTargeting })),
  createLibraryDraft: permittedProcedure(["*"]).input(z.object({ lineageKey: z.string().trim().min(1).max(120), type: z.enum(["script", "objection_response", "playbook", "case_study"]), title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(20_000), targeting: z.object({ profile: z.string().nullable().optional(), objections: z.array(z.string()).optional(), motivations: z.array(z.string()).optional(), source: z.string().nullable().optional(), campaign: z.string().nullable().optional(), ad: z.string().nullable().optional(), creative: z.string().nullable().optional(), acquisitionAngle: z.string().nullable().optional() }), evidence: z.object({ sampleSize: z.number().int().nonnegative().optional(), conversionRate: z.number().min(0).max(1).optional(), references: z.array(z.object({ feedbackEventId: z.string(), leadId: z.string() })).max(100).optional() }), originExperimentId: z.string().nullable().optional() })).mutation(({ ctx, input }) => createLibraryDraft({ ...input, actorId: ctx.session.user.id })),
  publishLibraryVersion: permittedProcedure(["*"]).input(z.object({ lineageKey: z.string().min(1) })).mutation(({ ctx, input }) => publishLibraryVersion({ ...input, actorId: ctx.session.user.id })),
  archiveLibraryVersion: permittedProcedure(["*"]).input(z.object({ lineageKey: z.string().min(1) })).mutation(({ ctx, input }) => archiveLibraryVersion({ ...input, actorId: ctx.session.user.id })),
});

