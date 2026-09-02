import { describe, it, expect } from "vitest";

import { isCloserOf } from "./is-closer-of";

describe("isCloserOf", () => {
	it("returns true when the user is the assigned closer", () => {
		const lead = { closerId: "user-123" };
		expect(isCloserOf(lead, "user-123")).toBe(true);
	});

	it("returns false when the user is not the assigned closer", () => {
		const lead = { closerId: "user-123" };
		expect(isCloserOf(lead, "user-999")).toBe(false);
	});

	it("returns false when the lead has no closer assigned", () => {
		const lead = { closerId: null };
		expect(isCloserOf(lead, "user-123")).toBe(false);
	});

	it("returns false when the user id is empty", () => {
		const lead = { closerId: "user-123" };
		expect(isCloserOf(lead, "")).toBe(false);
	});
});
