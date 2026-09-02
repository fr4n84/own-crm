import { TRPCError } from "@trpc/server";
import { db } from "@crm-fran/db";
import {
	alerts,
	LEAD_ACTIVITY_KIND,
	type AlertKind,
	type AlertSeverity,
} from "@crm-fran/db/schema/index";
import { ALERT_KIND_CONFIG } from "./config";
import { appendLeadActivity } from "../../leads/services/lead-activity";

export type CreateAlertInput = {
	leadId: string;
	targetUserId?: string;
	kind: AlertKind;
	message?: string;
	severity?: AlertSeverity;
	intervalMinutes?: number;
	maxOccurrences?: number | null;
	actorId?: string;
};

export async function createAlert(input: CreateAlertInput) {
	const config = ALERT_KIND_CONFIG[input.kind];
	const intervalMinutes = input.intervalMinutes ?? config.intervalMinutes;

	return db.transaction(async (tx) => {
		const [alert] = await tx
			.insert(alerts)
			.values({
			id: crypto.randomUUID(),
			leadId: input.leadId,
			targetUserId: input.targetUserId,
			kind: input.kind,
			message: input.message ?? config.message,
			severity: input.severity ?? config.severity,
			intervalMinutes,
			maxOccurrences: input.maxOccurrences ?? config.maxOccurrences,
			nextShowAt: new Date(Date.now() + intervalMinutes * 60_000),
			occurrences: 0,
			})
			.returning();

		if (!alert) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to create alert",
			});
		}

		await appendLeadActivity(tx, {
			leadId: alert.leadId,
			actorId: input.actorId,
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
			occurredAt: alert.createdAt,
		});

		return alert;
	});
}
