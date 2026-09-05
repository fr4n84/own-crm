import { db, isNull } from "@crm-fran/db";
import { alerts } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { processRecurringAlerts } from "./process-recurring";
import { buildAlertAccessCondition } from "./alert-access";

interface CountAlertsInput {
	actorId: string;
	permissions: Permission[];
}

export async function countAlerts(input: CountAlertsInput): Promise<number> {
	await processRecurringAlerts();
	const accessCondition = buildAlertAccessCondition(input.actorId, input.permissions);
	const rows = await db.query.alerts.findMany({
		where: (_fields, { and }) =>
			and(
				accessCondition,
				...[
					isNull(alerts.dismissedAt),
					isNull(alerts.resolvedAt),
					isNull(alerts.expiredAt),
				],
			),
		columns: { id: true },
	});

	return rows.length;
}
