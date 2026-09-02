import { describe, it, expect } from "vitest";
import { alerts, LEAD_STATE, leads } from "./index";

describe("schema barrel", () => {
	it("re-exports leads, alerts, and LEAD_STATE", () => {
		expect(leads).toBeDefined();
		expect(alerts).toBeDefined();
		expect(LEAD_STATE).toBeDefined();
	});
});
