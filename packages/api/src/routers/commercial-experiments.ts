import { z } from "zod";

import { createCommercialExperimentsService } from "../commercial-experiments/service";
import { commercialExperimentsRepository } from "../commercial-experiments/runtime";
import { router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

const interventionType = z.enum(["assignment_routing", "speed_priority", "follow_up_cadence", "next_best_action"]);
const primaryMetric = z.enum(["contacted", "appointment", "show", "sale"]);
const eligibility = z.object({ profiles: z.array(z.string().trim().min(1)).optional(), sources: z.array(z.string().trim().min(1)).optional(), campaigns: z.array(z.string().trim().min(1)).optional(), types: z.array(z.enum(["maestra", "vsl"])).optional() }).nullable().optional();
const config = z.record(z.string(), z.unknown());
const instructions = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, "Treatment instructions are required");

export const commercialExperimentCreateInput = z.object({ name: z.string().trim().min(1).max(160), hypothesis: z.string().trim().min(1).max(2_000), interventionType, primaryMetric, eligibility, treatmentConfig: config, treatmentInstructions: instructions, allocationPercent: z.number().int().min(0).max(100), minimumSamplePerArm: z.number().int().min(1).max(100_000), maturationDays: z.number().int().min(0).max(365), guardrailTolerancePp: z.number().int().min(0).max(100) });
export const commercialExperimentUpdateDraftInput = commercialExperimentCreateInput.partial().omit({ interventionType: true, primaryMetric: true }).extend({ experimentId: z.string().min(1) });
const experimentId = z.object({ experimentId: z.string().min(1) });
const service = createCommercialExperimentsService(commercialExperimentsRepository);
const admin = permittedProcedure(["*"]);

export const commercialExperimentsRouter = router({
  list: admin.query(({ ctx }) => service.list({ actorId: ctx.session.user.id, permissions: ctx.permissions })),
  detail: admin.input(experimentId).query(({ ctx, input }) => service.detail({ actorId: ctx.session.user.id, permissions: ctx.permissions, experimentId: input.experimentId, now: new Date() })),
  create: admin.input(commercialExperimentCreateInput).mutation(({ ctx, input }) => service.create({ actorId: ctx.session.user.id, permissions: ctx.permissions, value: { id: crypto.randomUUID(), ...input, eligibility: input.eligibility ?? null } })),
  updateDraft: admin.input(commercialExperimentUpdateDraftInput).mutation(({ ctx, input }) => service.updateDraft({ actorId: ctx.session.user.id, permissions: ctx.permissions, experimentId: input.experimentId, patch: input })),
  activate: admin.input(experimentId).mutation(({ ctx, input }) => service.activate({ actorId: ctx.session.user.id, permissions: ctx.permissions, experimentId: input.experimentId, now: new Date() })),
  enrollNew: admin.input(experimentId).mutation(({ ctx, input }) => service.enrollNew({ actorId: ctx.session.user.id, permissions: ctx.permissions, experimentId: input.experimentId, now: new Date() })),
  markTreatmentApplied: admin.input(z.object({ assignmentId: z.string().min(1) })).mutation(({ ctx, input }) => service.markTreatmentApplied({ actorId: ctx.session.user.id, permissions: ctx.permissions, assignmentId: input.assignmentId, now: new Date() })),
  stop: admin.input(experimentId).mutation(({ ctx, input }) => service.stop({ actorId: ctx.session.user.id, permissions: ctx.permissions, experimentId: input.experimentId, now: new Date() })),
  complete: admin.input(experimentId).mutation(({ ctx, input }) => service.complete({ actorId: ctx.session.user.id, permissions: ctx.permissions, experimentId: input.experimentId, now: new Date() })),
  recordFinalDecision: admin.input(z.object({ experimentId: z.string().min(1), decision: z.enum(["inconclusive", "rejected", "approved"]), notes: z.string().trim().min(1).max(2_000) })).mutation(({ ctx, input }) => service.recordFinalDecision({ actorId: ctx.session.user.id, permissions: ctx.permissions, ...input, now: new Date() })),
});