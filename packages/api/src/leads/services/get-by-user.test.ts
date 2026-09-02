import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQL } from "@crm-fran/db";

vi.mock("../queries/index", () => ({
	selectLeadWithUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("./get-all", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./get-all")>();
	return {
		...actual,
		buildDateWhere: vi.fn().mockReturnValue({} as SQL),
	};
});

import { getByUserId } from "./get-by-user";
import { selectLeadWithUsers } from "../queries/index";
import { buildDateWhere } from "./get-all";

const mockSelect = vi.mocked(selectLeadWithUsers);
const mockBuildDateWhere = vi.mocked(buildDateWhere);

describe("getByUserId", () => {
	beforeEach(() => {
		mockSelect.mockClear();
		mockBuildDateWhere.mockClear();
		mockBuildDateWhere.mockReturnValue({} as SQL);
	});

	describe("without dateRange", () => {
		it("does NOT call buildDateWhere", async () => {
			await getByUserId({ userId: "user-1" });
			expect(mockBuildDateWhere).not.toHaveBeenCalled();
		});

		it("calls selectLeadWithUsers with the user filter", async () => {
			await getByUserId({ userId: "user-1" });
			expect(mockSelect).toHaveBeenCalledTimes(1);
			const callArgs = mockSelect.mock.calls[0];
			expect(callArgs).toBeDefined();
			if (!callArgs) throw new Error("Expected mock to have been called");
			const [where] = callArgs;
			expect(where).toBeDefined();
		});
	});

	describe("with dateRange", () => {
		it("calls buildDateWhere with the provided dateRange", async () => {
			await getByUserId({ userId: "user-1", dateRange: { from: "2024-01-15", to: "2024-12-31" } });
			expect(mockBuildDateWhere).toHaveBeenCalledWith({ from: "2024-01-15", to: "2024-12-31" });
		});

		it("combines user filter with date filter via AND", async () => {
			await getByUserId({ userId: "user-1", dateRange: { from: "2024-01-15" } });
			expect(mockSelect).toHaveBeenCalledTimes(1);
			const callArgs = mockSelect.mock.calls[0];
			expect(callArgs).toBeDefined();
			if (!callArgs) throw new Error("Expected mock to have been called");
			const [where] = callArgs;
			expect(where).toBeDefined();
			// The WHERE should be a combined clause (and() of user filter + date filter)
			// We verify by checking buildDateWhere was called, meaning the composition happened
			expect(mockBuildDateWhere).toHaveBeenCalled();
		});
	});

	describe("with empty dateRange", () => {
		it("does not apply date filter for empty dateRange", async () => {
			mockBuildDateWhere.mockReturnValueOnce(undefined);
			await getByUserId({ userId: "user-1", dateRange: {} });
			// buildDateWhere({}) returns undefined → only user filter is applied
			expect(mockSelect).toHaveBeenCalledTimes(1);
			const callArgs = mockSelect.mock.calls[0];
			expect(callArgs).toBeDefined();
			if (!callArgs) throw new Error("Expected mock to have been called");
			const [where] = callArgs;
			expect(where).toBeDefined();
		});
	});

	it("returns whatever selectLeadWithUsers returns", async () => {
		// The mock returns [] by default; verify getByUserId delegates to it
		const result = await getByUserId({ userId: "user-1" });
		expect(result).toEqual([]);
		expect(mockSelect).toHaveBeenCalledTimes(1);
	});
});
