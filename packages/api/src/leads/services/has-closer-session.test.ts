import { describe, it, expect } from "vitest";
import { LEAD_QA_ROLE, type LeadQASessionItem } from "@crm-fran/db/schema/index";

import { hasCloserSession } from "./has-closer-session";

describe("hasCloserSession", () => {
	it("returns false for an empty session", () => {
		expect(hasCloserSession([])).toBe(false);
	});

	it("returns false when all items are caller-authored", () => {
		const items: LeadQASessionItem[] = [
			{ question: "Q1", answer: "A1", authorRole: LEAD_QA_ROLE.CALLER, authorId: "u1" },
			{ question: "Q2", answer: "A2", authorRole: LEAD_QA_ROLE.CALLER, authorId: "u1" },
		];

		expect(hasCloserSession(items)).toBe(false);
	});

	it("returns true when at least one item is closer-authored", () => {
		const items: LeadQASessionItem[] = [
			{ question: "Q1", answer: "A1", authorRole: LEAD_QA_ROLE.CALLER, authorId: "u1" },
			{ question: "Q2", answer: "A2", authorRole: LEAD_QA_ROLE.CLOSER, authorId: "u2" },
		];

		expect(hasCloserSession(items)).toBe(true);
	});

	it("returns true regardless of where the closer item appears", () => {
		const items: LeadQASessionItem[] = [
			{ question: "Q1", answer: "A1", authorRole: LEAD_QA_ROLE.CLOSER, authorId: "u2" },
			{ question: "Q2", answer: "A2", authorRole: LEAD_QA_ROLE.CALLER, authorId: "u1" },
		];

		expect(hasCloserSession(items)).toBe(true);
	});
});
