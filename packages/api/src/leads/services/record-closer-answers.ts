import { TRPCError } from "@trpc/server";
import { and, db, eq, inArray, isNull } from "@crm-fran/db";
import {
  alerts,
  leads,
  ALERT_KIND,
  LEAD_QA_ROLE,
	  type LeadQASessionItem,
	  rankingEvents,
		  RANKING_METRIC,
		  LEAD_ACTIVITY_KIND,
		} from "@crm-fran/db/schema/index";
import { ALERT_KIND_CONFIG } from "../../alerts/services/config";

import type { Context } from "../../context";
import { isCloserOf } from "./is-closer-of";
import { hasPermission } from "../../permissions";
import { deriveCloserRankingMetrics } from "../../rankings/ranking-metrics";
import { appendLeadActivity } from "./lead-activity";
import { getScheduledAt } from "./caller-outcome";

const CLOSER_ALERT_OUTCOMES = {
  "No-show": ALERT_KIND.NO_CONTACT,
  Reagenda: ALERT_KIND.RESCHEDULED,
  Seguimiento: ALERT_KIND.FOLLOW_UP,
} as const;

const CLOSER_OPERATIONAL_ALERT_KINDS = [
  ALERT_KIND.NO_CONTACT,
  ALERT_KIND.FOLLOW_UP,
  ALERT_KIND.APPOINTMENT,
  ALERT_KIND.RESCHEDULED,
] as const;

type CloserAlertOutcome = keyof typeof CLOSER_ALERT_OUTCOMES;

function isCloserAlertOutcome(value: string | undefined): value is CloserAlertOutcome {
  return value !== undefined && value in CLOSER_ALERT_OUTCOMES;
}

function scheduledCloserAlertAt({
  input,
  outcome,
}: {
  input: RecordCloserAnswersInput;
  outcome: CloserAlertOutcome;
}) {
  const config = ALERT_KIND_CONFIG[CLOSER_ALERT_OUTCOMES[outcome]];
  if (outcome === "No-show") {
    return new Date(Date.now() + config.intervalMinutes * 60_000);
  }

  if (!input.scheduledDate || !input.scheduledTime) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${outcome} requires a scheduled date and time`,
    });
  }

  const scheduledAt = getScheduledAt(input.scheduledDate, input.scheduledTime);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid scheduled date or time",
    });
  }
  return scheduledAt;
}

export type RecordCloserAnswersInput = {
  leadId: string;
  isContacted: "Si" | "No";
  scheduledDate?: string;
  scheduledTime?: string;
  questions?: Array<{ questionKey: string; question: string; answer: string }>;
  extraNotes?: string;
};

export async function recordCloserAnswers({
  ctx,
  input,
}: {
  ctx: Context;
  input: RecordCloserAnswersInput;
}) {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  const { leadId, isContacted, questions = [] } = input;

	  return db.transaction(async (tx) => {
	    const activityOccurredAt = new Date();
    const [lead] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, input.leadId));

    if (!lead) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Lead not found",
      });
    }

    if (
      !isCloserOf(lead, ctx.session.user.id) &&
      !hasPermission(ctx.permissions, ["*"])
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the assigned closer can record answers",
      });
    }

	    const allItems = (lead.questions ?? []) as LeadQASessionItem[];
	    const previousOutcome = [...allItems]
	      .reverse()
	      .find(
	        (item) =>
	          item.authorRole === LEAD_QA_ROLE.CLOSER &&
	          item.questionKey === "closerOutcome",
	      )?.answer;
	    const nextOutcome = questions.find(
	      (question) => question.questionKey === "closerOutcome",
	    )?.answer;

    const preservedItems = allItems.filter(
      (item) =>
        !(
          item.authorRole === LEAD_QA_ROLE.CLOSER &&
          item.authorId === ctx.session.user.id
        ),
    );

    const updatedQuestions: LeadQASessionItem[] = questions.map((q) => ({
      ...q,
      authorRole: LEAD_QA_ROLE.CLOSER,
      authorId: ctx.session.user.id,
    }));

    const [updated] = await tx
      .update(leads)
      .set({
        questions: [...preservedItems, ...updatedQuestions],
      })
      .where(eq(leads.id, input.leadId))
      .returning();

	    if (!updated) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update lead",
      });
	    }

	    await appendLeadActivity(tx, {
	      leadId,
	      actorId: ctx.session.user.id,
	      actorRole: LEAD_QA_ROLE.CLOSER,
	      kind: LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK,
	      title: "Feedback del closer registrado",
	      description: nextOutcome ?? (isContacted === "Si" ? "Lead contactado" : "Lead no contactado"),
	      metadata: { questions: updatedQuestions },
	      dedupeKey: `closer_feedback:${leadId}:${ctx.session.user.id}:${activityOccurredAt.toISOString()}`,
	      occurredAt: activityOccurredAt,
	    });

	    if (nextOutcome !== previousOutcome) {
	      const metrics = deriveCloserRankingMetrics(previousOutcome, nextOutcome);
	      const eventValues = metrics.flatMap((metric) => {
	        const creditedUserId =
	          metric === RANKING_METRIC.CALLER_SHOW
	            ? lead.callerId
	            : ctx.session?.user.id;
	        return creditedUserId
	          ? [{
	              id: crypto.randomUUID(),
	              metric,
	              userId: creditedUserId,
	              leadId,
	              dedupeKey: `${metric}:${leadId}:${creditedUserId}:${previousOutcome ?? "none"}:${nextOutcome ?? "none"}`,
	            }]
	          : [];
	      });
	      if (eventValues.length > 0) {
	        await tx.insert(rankingEvents).values(eventValues).onConflictDoNothing();
	      }
	    }

    let alertId: string | undefined;
    const targetCloserId = lead.closerId;
    const activeCloserAlerts = targetCloserId
      ? await tx
          .select()
          .from(alerts)
          .where(
            and(
              eq(alerts.leadId, leadId),
              eq(alerts.targetUserId, targetCloserId),
              inArray(alerts.kind, [...CLOSER_OPERATIONAL_ALERT_KINDS]),
              isNull(alerts.dismissedAt),
              isNull(alerts.resolvedAt),
              isNull(alerts.expiredAt),
            ),
          )
      : [];

    if (targetCloserId && isCloserAlertOutcome(nextOutcome)) {
      const kind = CLOSER_ALERT_OUTCOMES[nextOutcome];
      const config = ALERT_KIND_CONFIG[kind];
      const nextShowAt = scheduledCloserAlertAt({ input, outcome: nextOutcome });
      const intervalMinutes = Math.max(
        1,
        Math.ceil((nextShowAt.getTime() - Date.now()) / 60_000),
      );
      const [existingAlert, ...obsoleteAlerts] = activeCloserAlerts;

      if (obsoleteAlerts.length > 0) {
        await tx
          .update(alerts)
          .set({ resolvedAt: activityOccurredAt })
          .where(inArray(alerts.id, obsoleteAlerts.map(({ id }) => id)));
      }

      if (existingAlert) {
        const [alert] = await tx
          .update(alerts)
          .set({
            kind,
            message: config.message,
            severity: config.severity,
            intervalMinutes,
            maxOccurrences: config.maxOccurrences,
            nextShowAt,
            occurrences: 0,
          })
          .where(eq(alerts.id, existingAlert.id))
          .returning();
        alertId = alert?.id;
      } else {
        const [alert] = await tx
          .insert(alerts)
          .values({
            id: crypto.randomUUID(),
            leadId,
            targetUserId: targetCloserId,
            kind,
            message: config.message,
            severity: config.severity,
            intervalMinutes,
            maxOccurrences: config.maxOccurrences,
            nextShowAt,
            occurrences: 0,
          })
          .returning();
        alertId = alert?.id;
      }
    } else if (activeCloserAlerts.length > 0) {
      await tx
        .update(alerts)
        .set({ resolvedAt: activityOccurredAt })
        .where(inArray(alerts.id, activeCloserAlerts.map(({ id }) => id)));
    }

    if (alertId) {
      const [alert] = await tx
        .select()
        .from(alerts)
        .where(eq(alerts.id, alertId));
      if (alert) {
        await appendLeadActivity(tx, {
          leadId,
          actorId: ctx.session.user.id,
          actorRole: LEAD_QA_ROLE.CLOSER,
          kind: LEAD_ACTIVITY_KIND.ALERT_CREATED,
          title: "Alerta creada",
          description: alert.message,
          metadata: {
            alertId: alert.id,
            alertKind: alert.kind,
            severity: alert.severity,
            targetUserId: alert.targetUserId,
          },
          dedupeKey: `alert_created:${alert.id}`,
          occurredAt: activityOccurredAt,
        });
      }
    }

    return { leadId: updated.id, alertId };
  });
}
