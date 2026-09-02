import { describe, it, expect } from "vitest";
import { alerts, alertsRelations, ALERT_KIND, ALERT_SEVERITY } from "./alerts";

describe("alerts schema", () => {
	it("exports the alerts table", () => {
		expect(alerts).toBeDefined();
	});

	it("exports alert kind and severity constants", () => {
		expect(ALERT_KIND.NO_CONTACT).toBe("no_contact");
		expect(ALERT_KIND.FOLLOW_UP).toBe("follow_up");
		expect(Object.values(ALERT_SEVERITY)).toEqual([
			"info",
			"warning",
			"urgent",
		]);
	});

	it("exports relations", () => {
		expect(alertsRelations).toBeDefined();
	});

	it("tracks automated expiration separately from resolution and dismissal", () => {
		expect(alerts.expiredAt).toBeDefined();
	});
});
