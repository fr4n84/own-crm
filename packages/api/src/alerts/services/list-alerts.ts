import { db, asc, eq, isNull, type SQL } from "@crm-fran/db";
import { alerts } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";

export type ListAlertsInput = {
	actorId: string;
	permissions: Permission[];
	leadId?: string;
	targetUserId?: string;
	includeDismissed?: boolean;
	includeResolved?: boolean;
	limit?: number;
	offset?: number;
};

export type AlertRow = Awaited<ReturnType<typeof listAlerts>>[number];

export async function listAlerts(input: ListAlertsInput) {
	const limit = Math.min(input.limit ?? 50, 100);
	const offset = input.offset ?? 0;

	const conditions: SQL<unknown>[] = [];

	if (input.leadId) {
		conditions.push(eq(alerts.leadId, input.leadId));
	}

	if (input.targetUserId) {
		conditions.push(eq(alerts.targetUserId, input.targetUserId));
	}

	conditions.push(isNull(alerts.dismissedAt));
	conditions.push(isNull(alerts.resolvedAt));
	conditions.push(isNull(alerts.expiredAt));

		return db.query.alerts.findMany({
			with: {
					lead: {
						with: {
							caller: true,
							closer: true,
						},
				},
				targetUser: true,
			},
		where: conditions.length > 0 ? (_fields, { and }) => and(...conditions) : undefined,
		orderBy: asc(alerts.nextShowAt),
		limit,
		offset,
	});
}
