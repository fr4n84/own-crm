import { and, gte, lte, type SQL } from "@crm-fran/db";
import { leads } from "@crm-fran/db/schema/index";
import { selectLeadWithUsers } from "../queries/index";

export type DateRange = { from?: string; to?: string };

/**
 * Parse an ISO date string "YYYY-MM-DD" into [year, month, day] numbers.
 * Returns undefined if the string is not a valid 3-part date.
 */
function parseIsoDateParts(iso: string): [number, number, number] | undefined {
	const parts = iso.split("-");
	if (parts.length !== 3) return undefined;
	const y = Number(parts[0]);
	const m = Number(parts[1]);
	const d = Number(parts[2]);
	if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
		return undefined;
	}

	const date = new Date(y, m - 1, d);
	if (
		date.getFullYear() !== y ||
		date.getMonth() !== m - 1 ||
		date.getDate() !== d
	) {
		return undefined;
	}

	return [y, m, d];
}

/**
 * Build a SQL WHERE clause from a date range.
 * Uses start-of-day for `from` and end-of-day for `to` in local timezone
 * so that timestamp indexes remain usable.
 */
export function buildDateWhere(dateRange?: DateRange): SQL | undefined {
	if (!dateRange) return undefined;

	const conditions: SQL[] = [];

	if (dateRange.from) {
		const parsed = parseIsoDateParts(dateRange.from);
		if (parsed) {
			const [y, m, d] = parsed;
			conditions.push(gte(leads.createdAt, new Date(y, m - 1, d)));
		}
	}

	if (dateRange.to) {
		const parsed = parseIsoDateParts(dateRange.to);
		if (parsed) {
			const [y, m, d] = parsed;
			conditions.push(lte(leads.createdAt, new Date(y, m - 1, d, 23, 59, 59, 999)));
		}
	}

	if (conditions.length === 0) return undefined;
	if (conditions.length === 1) {
		const single = conditions[0];
		if (!single) return undefined;
		return single;
	}
	return and(...conditions);
}

export async function getAll({ dateRange }: { dateRange?: DateRange } = {}) {
	const where = buildDateWhere(dateRange);
	return where ? selectLeadWithUsers(where) : selectLeadWithUsers();
}
