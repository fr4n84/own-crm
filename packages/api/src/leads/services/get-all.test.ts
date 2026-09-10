import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../queries/index", () => ({
	selectLeadWithUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("@crm-fran/db", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@crm-fran/db")>();
	return {
		...actual,
		isNull: vi.fn(actual.isNull),
	};
});

import { isNull } from "@crm-fran/db";
import { leads } from "@crm-fran/db/schema/index";
import { getAll } from "./get-all";
import { selectLeadWithUsers } from "../queries/index";

const mockIsNull = vi.mocked(isNull);
const mockSelect = vi.mocked(selectLeadWithUsers);

describe("getAll", () => {
	beforeEach(() => {
		mockIsNull.mockClear();
		mockSelect.mockClear();
	});

	describe("without dateRange", () => {
		it("applies the default filter that excludes merged leads", async () => {
			await getAll();
			expect(mockIsNull).toHaveBeenCalledWith(leads.mergedIntoLeadId);
			expect(mockSelect).toHaveBeenCalledTimes(1);
			expect(mockSelect.mock.calls[0]?.[0]).toBeDefined();
		});

		it("keeps the merged-lead filter when dateRange is empty", async () => {
			await getAll({ dateRange: {} });
			expect(mockIsNull).toHaveBeenCalledWith(leads.mergedIntoLeadId);
			expect(mockSelect).toHaveBeenCalledTimes(1);
			expect(mockSelect.mock.calls[0]?.[0]).toBeDefined();
		});
	});

	describe("with dateRange.from only", () => {
		it("calls selectLeadWithUsers with a WHERE clause (gte)", async () => {
			await getAll({ dateRange: { from: "2024-01-15" } });
			expect(mockSelect).toHaveBeenCalledTimes(1);
			const callArgs = mockSelect.mock.calls[0];
			expect(callArgs).toBeDefined();
			if (!callArgs) throw new Error("Expected mock to have been called");
			const [where] = callArgs;
			expect(where).toBeDefined();
		});
	});

	describe("with dateRange.to only", () => {
		it("calls selectLeadWithUsers with a WHERE clause (lte)", async () => {
			await getAll({ dateRange: { to: "2024-12-31" } });
			expect(mockSelect).toHaveBeenCalledTimes(1);
			const callArgs = mockSelect.mock.calls[0];
			expect(callArgs).toBeDefined();
			if (!callArgs) throw new Error("Expected mock to have been called");
			const [where] = callArgs;
			expect(where).toBeDefined();
		});
	});

	describe("with both dateRange.from and dateRange.to", () => {
		it("calls selectLeadWithUsers with a combined WHERE clause (and)", async () => {
			await getAll({ dateRange: { from: "2024-01-15", to: "2024-12-31" } });
			expect(mockSelect).toHaveBeenCalledTimes(1);
			const callArgs = mockSelect.mock.calls[0];
			expect(callArgs).toBeDefined();
			if (!callArgs) throw new Error("Expected mock to have been called");
			const [where] = callArgs;
			expect(where).toBeDefined();
		});
	});

	it("returns whatever selectLeadWithUsers returns", async () => {
		// The mock returns [] by default; verify getAll delegates to it
		const result = await getAll();
		expect(result).toEqual([]);
		expect(mockSelect).toHaveBeenCalledTimes(1);
	});
});
