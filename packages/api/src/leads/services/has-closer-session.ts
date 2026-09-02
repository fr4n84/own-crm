import { LEAD_QA_ROLE, type LeadQASessionItem } from "@crm-fran/db/schema/index";

export function hasCloserSession(
	items: ReadonlyArray<LeadQASessionItem>,
): boolean {
	return items.some((item) => item.authorRole === LEAD_QA_ROLE.CLOSER);
}
