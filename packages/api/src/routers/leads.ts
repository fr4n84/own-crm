import { z } from "zod";
import { router } from "../index";
import {
  getAll,
  getById,
  getByUserId,
  assignLead,
  assignLeadToCaller,
  getWithoutAssigned,
  recordCloserAnswers,
  adminEditLeadQASession,
  getPersonalStatistics,
  createLead,
  setLeadType,
  getLeadActivity,
  getFeedbackStatistics,
  updateAcquisitionAttribution,
  deleteLead,
} from "../leads/services/index";
import { permittedProcedure } from "@crm-fran/api/trpc/trpc";
import { getMonthlyCallFeedbackUsage } from "../call-feedback-runtime";
import { validateConfirmedFeedbackQuestions } from "../call-feedback";

const idInput = z.object({ id: z.string() });
export const createLeadInput = z.object({
  name: z.string(),
  email: z.email(),
  phone: z.string(),
  source: z.string().trim().min(1).max(200).optional(),
  campaign: z.string().trim().min(1).max(200).optional(),
  ad: z.string().trim().min(1).max(200).optional(),
  creative: z.string().trim().min(1).max(200).optional(),
  acquisitionAngle: z.string().trim().min(1).max(200).optional(),
  utmContent: z.string().trim().min(1).max(300).optional(),
  type: z.enum(["maestra", "vsl"]).default("maestra"),
});
const updateLeadInput = createLeadInput.partial().extend({ id: z.string() });
const nullableAttribution = z.string().trim().max(200).nullable();
export const updateAcquisitionAttributionInput = z.object({
  leadId: z.string().min(1),
  source: nullableAttribution,
  campaign: nullableAttribution,
  ad: nullableAttribution,
  creative: nullableAttribution,
  acquisitionAngle: nullableAttribution,
});

const dateRangeInput = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .optional();

const qaSessionInput = z.discriminatedUnion("isContacted", [
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("Si"),
    scheduledDate: z.string().min(1).optional(),
    scheduledTime: z.string().min(1).optional(),
    questions: z.array(
      z.object({
        questionKey: z.string().min(1),
        question: z.string().min(1),
        answer: z.string().min(1),
      }),
    ),
    extraNotes: z.string().optional(),
  }),
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("No"),
    questions: z
      .array(
        z.object({
          questionKey: z.string().min(1),
          question: z.string().min(1),
          answer: z.string().min(1),
        }),
      )
      .optional(),
  }),
]);

export const callerQuestionsInput = z
  .array(
    z.object({
      questionKey: z.string().min(1),
      question: z.string().min(1),
      answer: z.string(),
    }),
  ).superRefine((questions, context) => {
    try { validateConfirmedFeedbackQuestions(questions); }
    catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid confirmed feedback" }); }
  })
  .optional();

export const personalStatisticsInput = z
  .object({
    callerId: z.string().min(1).optional(),
    closerId: z.string().min(1).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((value) => !(value.callerId && value.closerId), {
    message: "Caller and closer filters cannot be combined",
  })
  .refine((value) => !(value.from && value.to && value.from > value.to), {
    message: "From date must be before or equal to to date",
    path: ["to"],
  });

export const feedbackStatisticsInput = z
  .object({
    callerId: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    campaign: z.string().min(1).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((value) => !(value.from && value.to && value.from > value.to), {
    message: "From date must be before or equal to to date",
    path: ["to"],
  });

export const assignLeadInput = z.union([
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("Si"),
    outcome: z.literal("future_call"),
    scheduledDate: z.string().date(),
    scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
    alertSeverity: z.enum(["urgent", "warning", "info"]),
    questions: callerQuestionsInput,
  }),
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("Si"),
    outcome: z.literal("not_fit"),
    questions: callerQuestionsInput,
  }),
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("Si"),
    outcome: z.literal("not_interested"),
    questions: callerQuestionsInput,
  }),
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("Si"),
    outcome: z.literal("appointment"),
    closerId: z.string().min(1),
    scheduledDate: z.string().date(),
    scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
    questions: callerQuestionsInput,
  }),
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("Si"),
    closerId: z.string().min(1),
    scheduledDate: z.string().min(1).optional(),
    scheduledTime: z.string().min(1).optional(),
    questions: z.array(
      z.object({
        questionKey: z.string().min(1),
        question: z.string().min(1),
        answer: z.string().min(1),
      }),
    ),
    extraNotes: z.string().optional(),
  }),
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("No"),
    phoneStatus: z.literal("invalid"),
  }),
  z.object({
    leadId: z.string().min(1),
    isContacted: z.literal("No"),
  }),
]).and(
  z.object({
    sourceAlertId: z.string().min(1).optional(),
  }),
);

export const leadsRouter = router({
	monthlyCallFeedbackUsage: permittedProcedure(["*"]).query(() =>
		getMonthlyCallFeedbackUsage(),
	),
	activity: permittedProcedure(["leads:read"])
		.input(idInput)
		.query(async ({ input }) => {
			return await getLeadActivity(input.id);
		}),

	personalStatistics: permittedProcedure(["leads:read"])
		.input(personalStatisticsInput)
		.query(async ({ input }) => {
			return await getPersonalStatistics(input);
		}),

	feedbackStatistics: permittedProcedure(["leads:read"])
		.input(feedbackStatisticsInput)
		.query(async ({ input }) => {
			return await getFeedbackStatistics(input);
		}),

  listAll: permittedProcedure(["leads:read"])
    .input(dateRangeInput)
    .query(async ({ input }) => {
    return await getAll({ dateRange: input });
  }),

  listWithoutAssigned: permittedProcedure(["leads:read"])
    .input(
      z.object({
        type: z.enum(["maestra", "vsl"]),
        poolStatus: z.enum(["new", "recovered", "discarded"]).default("new"),
      }),
    )
    .query(async ({ input }) => {
      return await getWithoutAssigned(input);
    }),

  getById: permittedProcedure(["leads:read"])
    .input(idInput)
    .query(async ({ input }) => {
      return await getById({ id: input.id });
    }),

  listByUserId: permittedProcedure(["leads:read"])
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
    return await getByUserId({ userId: ctx.session.user.id, dateRange: input });
  }),

  assignLead: permittedProcedure(["leads:write"])
    .input(assignLeadInput)
    .mutation(async ({ ctx, input }) => {
      return await assignLead({
        input,
        callerId: ctx.session.user.id,
        authorRole:
          ctx.session.user.roleId === "role-closer"
            ? "closer"
            : "caller",
        permissions: ctx.permissions,
      });
    }),

  /**
   * Asigna un lead a un caller para que empiece a trabajarlo.
   * Falla con `CONFLICT` si el caller ya tiene un lead en estado "sin asignar".
   */
  assignLeadToCaller: permittedProcedure(["leads:write"])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await assignLeadToCaller({ id: input.id, userId: ctx.session.user.id });
    }),

  setType: permittedProcedure(["leads:write"])
    .input(
      z.object({
        id: z.string().min(1),
        type: z.enum(["maestra", "vsl"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await setLeadType({ ...input, actorId: ctx.session.user.id });
    }),

  create: permittedProcedure(["leads:write"])
    .input(createLeadInput)
    .mutation(async ({ input }) => {
      return await createLead(input);
    }),

  update: permittedProcedure(["leads:write"])
    .input(updateLeadInput)
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      return { id, ...rest };
    }),

  updateAcquisitionAttribution: permittedProcedure(["*"])
    .input(updateAcquisitionAttributionInput)
    .mutation(async ({ ctx, input }) => {
      const { leadId, ...attribution } = input;
      return updateAcquisitionAttribution({
        leadId,
        actorId: ctx.session.user.id,
        attribution,
      });
    }),

  delete: permittedProcedure(["leads:delete"])
    .input(idInput)
    .mutation(async ({ input }) => {
      return deleteLead(input.id);
    }),

  recordCloserAnswers: permittedProcedure(["leads:write"])
    .input(qaSessionInput)
    .mutation(async ({ ctx, input }) => {
      return await recordCloserAnswers({ ctx, input });
    }),

  adminEditLeadQASession: permittedProcedure(["*"])
    .input(qaSessionInput)
    .mutation(async ({ ctx, input }) => {
      return await adminEditLeadQASession({ ctx, input });
    }),
});
