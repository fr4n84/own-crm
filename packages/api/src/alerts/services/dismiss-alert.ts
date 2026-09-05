import { TRPCError } from "@trpc/server";
import { db, eq, sql } from "@crm-fran/db";
import { alerts, leads, LEAD_ACTIVITY_KIND } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { appendLeadActivity } from "../../leads/services/lead-activity";
import { canAccessAlertRecord } from "./alert-access-policy";

export type DismissAlertInput = {
	id: string;
	actorId: string;
	permissions: Permission[];
};

export async function dismissAlert(input: DismissAlertInput) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select ${alerts.id} from ${alerts} inner join ${leads} on ${leads.id} = ${alerts.leadId} where ${alerts.id} = ${input.id} for update`);
		const alert = await tx.query.alerts.findFirst({
			where: (table, { eq }) => eq(table.id, input.id),
			with: { lead: { columns: { callerId: true, closerId: true } } },
		});

		if (!alert) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Alert not found",
			});
		}

		if (!canAccessAlertRecord(alert, input.actorId, input.permissions)) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You do not have permission to dismiss this alert",
			});
		}

	if (alert.resolvedAt) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Alert is already resolved",
		});
	}

	const [updated] = await tx
		.update(alerts)
		.set({
			dismissedAt: new Date(),
			dismissedBy: input.actorId,
		})
		.where(eq(alerts.id, input.id))
		.returning();

	if (!updated) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to dismiss alert",
		});
	}

	await appendLeadActivity(tx, {
		leadId: updated.leadId,
		actorId: input.actorId,
		kind: LEAD_ACTIVITY_KIND.ALERT_DISMISSED,
		title: "Alerta descartada",
		description: updated.message,
		metadata: { alertId: updated.id, alertKind: updated.kind },
		dedupeKey: `alert_dismissed:${updated.id}`,
		occurredAt: updated.dismissedAt ?? new Date(),
	});

	return updated;
	});
}
