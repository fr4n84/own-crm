import { db, isNull } from "@crm-fran/db";
import { alerts } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { processRecurringAlerts } from "./process-recurring";

interface CountAlertsInput {
	actorId: string;
	permissions: Permission[];
}

export async function countAlerts(_input: CountAlertsInput): Promise<number> {
	await processRecurringAlerts();
	const rows = await db.query.alerts.findMany({
		where: (_fields, { and }) =>
			and(
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
