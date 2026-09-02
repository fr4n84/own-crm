import { describe, it, expect } from "vitest";
import { buildDateWhere } from "./get-all";
import { z } from "zod";

/**
 * Contract test: the router's dateRangeInput schema defines the wire format
 * that the page must send. This test documents the exact shape and verifies
 * the schema accepts what the page should provide (direct { from?, to? },
 * NOT wrapped in { dateRange: ... }).
 */
const dateRangeInput = z
	.object({
		from: z.string().date().optional(),
		to: z.string().date().optional(),
	})
	.optional();

describe("buildDateWhere", () => {
	it("returns undefined when dateRange is undefined", () => {
		expect(buildDateWhere(undefined)).toBeUndefined();
	});

	it("returns undefined when dateRange is an empty object", () => {
		expect(buildDateWhere({})).toBeUndefined();
	});

	it("returns a SQL object when only from is provided", () => {
		const result = buildDateWhere({ from: "2024-01-15" });
		expect(result).toBeDefined();
	});

	it("returns a SQL object when only to is provided", () => {
		const result = buildDateWhere({ to: "2024-12-31" });
		expect(result).toBeDefined();
	});

	it("returns a SQL object when both from and to are provided", () => {
		const result = buildDateWhere({ from: "2024-01-15", to: "2024-12-31" });
		expect(result).toBeDefined();
	});

	it("ignores an invalid calendar date instead of normalizing it", () => {
		expect(buildDateWhere({ from: "2024-02-30" })).toBeUndefined();
	});
});

describe("router dateRangeInput contract (wire format)", () => {
	it("accepts undefined (no filter)", () => {
		expect(dateRangeInput.parse(undefined)).toBeUndefined();
	});

	it("accepts direct { from, to } shape (correct page call)", () => {
		const input = { from: "2024-01-01", to: "2024-12-31" };
		expect(dateRangeInput.parse(input)).toEqual(input);
	});

	it("accepts { from } only", () => {
		expect(dateRangeInput.parse({ from: "2024-06-01" })).toEqual({ from: "2024-06-01" });
	});

	it("accepts { to } only", () => {
		expect(dateRangeInput.parse({ to: "2024-06-30" })).toEqual({ to: "2024-06-30" });
	});

	it("wrapped { dateRange } shape is not the router wire format", () => {
		// The router expects { from, to } directly. Zod strips unknown keys at
		// runtime, producing {} instead of applying the nested date range.
		const wrapped = { dateRange: { from: "2024-01-01", to: "2024-12-31" } };
		const parsed = dateRangeInput.parse(wrapped);
		// Zod strips unknown keys → result is {} (empty object, NOT undefined)
		expect(parsed).toEqual({});
	});
});
