import { and, eq, or } from "@crm-fran/db";
import { leads } from "@crm-fran/db/schema/index";
import { selectLeadWithUsers } from "../queries/index";
import { buildDateWhere, type DateRange } from "./get-all";

export async function getByUserId({
	userId,
	dateRange,
}: {
	userId: string;
	dateRange?: DateRange;
}) {
	const userFilter = or(eq(leads.callerId, userId), eq(leads.closerId, userId));
	const dateFilter = dateRange ? buildDateWhere(dateRange) : undefined;

	if (dateFilter) {
		return await selectLeadWithUsers(and(userFilter, dateFilter));
	}
	return await selectLeadWithUsers(userFilter);
}
