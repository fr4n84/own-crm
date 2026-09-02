import { TRPCError } from "@trpc/server";
import { db, eq } from "@crm-fran/db";
import { alerts, LEAD_ACTIVITY_KIND } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { appendLeadActivity } from "../../leads/services/lead-activity";

export type ResolveAlertInput = {
	id: string;
	actorId: string;
	permissions: Permission[];
};

function isAdmin(permissions: Permission[]) {
	return (
		permissions.includes("*") ||
		permissions.includes("alerts:*") ||
		permissions.includes("users:read")
	);
}

export async function resolveAlert(input: ResolveAlertInput) {
	return db.transaction(async (tx) => {
	const alert = await tx.query.alerts.findFirst({
		where: (table, { eq }) => eq(table.id, input.id),
	});

	if (!alert) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Alert not found",
		});
	}

	if (!isAdmin(input.permissions) && alert.targetUserId !== input.actorId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have permission to resolve this alert",
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
			resolvedAt: new Date(),
		})
		.where(eq(alerts.id, input.id))
		.returning();

	if (!updated) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to resolve alert",
		});
	}

	await appendLeadActivity(tx, {
		leadId: updated.leadId,
		actorId: input.actorId,
		kind: LEAD_ACTIVITY_KIND.ALERT_RESOLVED,
		title: "Alerta resuelta",
		description: updated.message,
		metadata: { alertId: updated.id, alertKind: updated.kind },
		dedupeKey: `alert_resolved:${updated.id}`,
		occurredAt: updated.resolvedAt ?? new Date(),
	});

	return updated;
	});
}
