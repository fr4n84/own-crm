import { TRPCError } from "@trpc/server";
import { db, eq } from "@crm-fran/db";
import {
  leads,
  LEAD_ACTIVITY_KIND,
} from "@crm-fran/db/schema/index";

import { hasPermission } from "../../permissions";
import type { Context } from "../../context";
import { appendLeadActivity } from "./lead-activity";
import { validateConfirmedFeedbackQuestions } from "../../call-feedback";
import { LEAD_FEEDBACK_ACTIVITY_SOURCE } from "../../lead-feedback-events";

export type AdminEditLeadQASessionInput = {
  leadId: string;
  isContacted: "Si" | "No";
  scheduledDate?: string;
  scheduledTime?: string;
  questions?: Array<{ questionKey: string; question: string; answer: string }>;
  extraNotes?: string;
};

export async function adminEditLeadQASession({
  ctx,
  input,
}: {
  ctx: Context;
  input: AdminEditLeadQASessionInput;
}) {
  return db.transaction(async (tx) => {
    if (!hasPermission(ctx.permissions, ["*"])) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin permission required",
      });
    }
    const actorId = ctx.session?.user.id;
    if (!actorId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const { leadId, questions = [] } = input;
    try { validateConfirmedFeedbackQuestions(questions); }
    catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid confirmed feedback" }); }

    const [lead] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, leadId));

    if (!lead) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Lead not found",
      });
    }

    const storedQuestions = questions.map((question) => ({
      ...question,
      authorRole: "caller" as const,
      authorId: actorId,
    }));
    const [updated] = await tx
      .update(leads)
      .set({
        questions: storedQuestions,
      })
      .where(eq(leads.id, leadId))
      .returning();

		if (!updated) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update lead",
      });
		}

		await appendLeadActivity(tx, {
			leadId,
			actorId: ctx.session?.user.id,
			actorRole: "admin",
			kind: LEAD_ACTIVITY_KIND.CALLER_FEEDBACK,
			title: "Sesión editada por administración",
			description: "Se actualizaron las respuestas registradas del lead",
			metadata: { questions: storedQuestions, activitySource: LEAD_FEEDBACK_ACTIVITY_SOURCE.ADMINISTRATIVE_QA_EDIT },
			dedupeKey: `admin_feedback:${leadId}:${new Date().toISOString()}`,
		});

		return { ...updated, questions };
  });
}
