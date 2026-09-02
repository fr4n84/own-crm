import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index";
import { permittedProcedure } from "@crm-fran/api/trpc/trpc";
import {
	createAlert,
	countAlerts,
	dismissAlert,
	listAlerts,
	listLeadRiskQueue,
	listNextBestActions,
	resolveNextBestActionModes,
	listRecommendationMetrics,
	recordRecommendationEvent,
	resolveAlert,
	processRecurringAlerts,
	getAlertPreferences,
	updateAlertPreferences,
} from "../alerts/services/index";
import {
	ALERT_KIND,
	ALERT_RELEVANCE_MODE,
	ALERT_SEVERITY,
} from "@crm-fran/db/schema/index";

const createAlertInput = z.object({
	leadId: z.string().min(1),
	targetUserId: z.string().min(1).optional(),
	kind: z.nativeEnum(ALERT_KIND),
	message: z.string().min(1).optional(),
	severity: z.nativeEnum(ALERT_SEVERITY).optional(),
	intervalMinutes: z.number().int().positive().optional(),
	maxOccurrences: z.number().int().positive().nullish(),
});

const listAlertsInput = z
	.object({
		leadId: z.string().min(1).optional(),
		targetUserId: z.string().min(1).optional(),
		includeDismissed: z.boolean().default(false),
		includeResolved: z.boolean().default(false),
		limit: z.number().int().positive().max(100).optional(),
		offset: z.number().int().nonnegative().optional(),
	})
	.optional();

const alertIdInput = z.object({
	id: z.string().min(1),
});

export const recommendationEventInput = z.object({
	leadId: z.string().min(1),
	recommendationKey: z.string().min(1),
	actionType: z.string().min(1).max(100).optional(),
	kind: z.enum(["recommendation_shown", "recommendation_opened", "recommendation_completed", "recommendation_skipped"]),
	reason: z.string().trim().min(1).max(500).optional(),
	reactionTimeMs: z.number().int().nonnegative().optional(),
}).superRefine((value, ctx) => {
	if (value.kind === "recommendation_skipped" && !value.reason) {
		ctx.addIssue({ code: "custom", path: ["reason"], message: "Skip reason is required" });
	}
});

export const nextBestActionModeInput = z.object({ mode: z.enum(["caller", "closer"]) });

export const alertPreferencesInput = z
	.object({
		relevanceMode: z.nativeEnum(ALERT_RELEVANCE_MODE),
		urgentThresholdHours: z.number().int().min(0).max(720),
		warningThresholdHours: z.number().int().min(1).max(720),
		noContactSeverity: z.nativeEnum(ALERT_SEVERITY),
		followUpSeverity: z.nativeEnum(ALERT_SEVERITY),
		futureCallSeverity: z.nativeEnum(ALERT_SEVERITY),
		appointmentSeverity: z.nativeEnum(ALERT_SEVERITY),
		rescheduledSeverity: z.nativeEnum(ALERT_SEVERITY),
	})
	.refine(
		(value) => value.warningThresholdHours > value.urgentThresholdHours,
		{
			message: "Warning threshold must be greater than urgent threshold",
			path: ["warningThresholdHours"],
		},
	);

export const alertsRouter = router({
	getPreferences: protectedProcedure.query(async ({ ctx }) => {
		return await getAlertPreferences(ctx.session.user.id);
	}),

	updatePreferences: protectedProcedure
		.input(alertPreferencesInput)
		.mutation(async ({ ctx, input }) => {
			return await updateAlertPreferences(ctx.session.user.id, input);
		}),

	createAlert: permittedProcedure(["alerts:write"])
		.input(createAlertInput)
		.mutation(async ({ ctx, input }) => {
			return await createAlert({ ...input, actorId: ctx.session.user.id });
		}),

	countAlerts: permittedProcedure(["alerts:read"]).query(async ({ ctx }) => {
		return await countAlerts({
			actorId: ctx.session.user.id,
			permissions: ctx.permissions,
		});
	}),

	listAlerts: permittedProcedure(["alerts:read"])
		.input(listAlertsInput)
		.query(async ({ ctx, input }) => {
			return await listAlerts({
				actorId: ctx.session.user.id,
				permissions: ctx.permissions,
				leadId: input?.leadId,
				targetUserId: input?.targetUserId,
				includeDismissed: input?.includeDismissed,
				includeResolved: input?.includeResolved,
				limit: input?.limit,
				offset: input?.offset,
			});
		}),

	listLeadRiskQueue: permittedProcedure(["alerts:read"]).query(async ({ ctx }) => {
		return await listLeadRiskQueue({
			actorId: ctx.session.user.id,
			permissions: ctx.permissions,
		});
	}),

	getNextBestActionModes: permittedProcedure(["alerts:read"]).query(async ({ ctx }) => {
		return await resolveNextBestActionModes({
			actorId: ctx.session.user.id,
			roleId: ctx.session.user.roleId,
			permissions: ctx.permissions,
		});
	}),

	listNextBestActions: permittedProcedure(["alerts:read"]).input(nextBestActionModeInput).query(async ({ ctx, input }) => {
		const authorizedModes = await resolveNextBestActionModes({ actorId: ctx.session.user.id, roleId: ctx.session.user.roleId, permissions: ctx.permissions });
		if (!authorizedModes.includes(input.mode)) {
			throw new TRPCError({ code: "FORBIDDEN", message: "El modo de trabajo no corresponde al rol autenticado" });
		}
		return await listNextBestActions({
			actorId: ctx.session.user.id,
			permissions: ctx.permissions,
			roleId: ctx.session.user.roleId,
			mode: input.mode,
			authorizedModes,
		});
	}),

	getNextBestActionMetrics: permittedProcedure(["alerts:read"]).input(nextBestActionModeInput.optional()).query(async ({ ctx, input }) => {
		const authorizedModes = await resolveNextBestActionModes({ actorId: ctx.session.user.id, roleId: ctx.session.user.roleId, permissions: ctx.permissions });
		if (input && !authorizedModes.includes(input.mode)) {
			throw new TRPCError({ code: "FORBIDDEN", message: "El modo de trabajo no corresponde al rol autenticado" });
		}
		return await listRecommendationMetrics({ actorId: ctx.session.user.id, permissions: ctx.permissions, mode: input?.mode });
	}),

	recordNextBestActionEvent: permittedProcedure(["alerts:write"])
		.input(recommendationEventInput)
		.mutation(async ({ ctx, input }) => {
			return await recordRecommendationEvent({ ...input, actorId: ctx.session.user.id, permissions: ctx.permissions });
		}),

	dismissAlert: permittedProcedure(["alerts:write"])
		.input(alertIdInput)
		.mutation(async ({ ctx, input }) => {
			return await dismissAlert({
				id: input.id,
				actorId: ctx.session.user.id,
				permissions: ctx.permissions,
			});
		}),

	resolveAlert: permittedProcedure(["alerts:write"])
		.input(alertIdInput)
		.mutation(async ({ ctx, input }) => {
			return await resolveAlert({
				id: input.id,
				actorId: ctx.session.user.id,
				permissions: ctx.permissions,
			});
		}),

	advanceRecurringAlerts: protectedProcedure.query(async ({ ctx }) => {
		return await processRecurringAlerts(new Date(), ctx.session.user.id);
	}),
});
