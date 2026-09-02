import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
	leads,
	LEAD_TYPE,
	LEAD_QA_ROLE,
	type LeadType,
	type LeadQARole,
	type LeadQASessionItem,
	type LeadQASession,
} from "./leads";
import { LEAD_STATE } from "./state";

describe("leads schema", () => {
	it("defines the imported lead types and defaults legacy rows to maestra", () => {
		const leadType: LeadType = LEAD_TYPE.VSL;
		expect(leadType).toBe("vsl");
		expect(LEAD_TYPE.MAESTRA).toBe("maestra");
		expect(leads.type.default).toBe(LEAD_TYPE.MAESTRA);
	});

	it("exports LEAD_QA_ROLE and LeadQARole", () => {
		const role: LeadQARole = LEAD_QA_ROLE.CALLER;
		expect(role).toBe("caller");
		expect(LEAD_QA_ROLE.CALLER).toBe("caller");
		expect(LEAD_QA_ROLE.CLOSER).toBe("closer");
	});

	it("allows LeadQASessionItem with authorRole and authorId", () => {
		const item: LeadQASessionItem = {
			questionKey: "question-1",
			question: "Q",
			answer: "A",
			authorRole: LEAD_QA_ROLE.CALLER,
			authorId: "u1",
		};
		expect(item.authorRole).toBe("caller");
	});

	it("allows LeadQASession array", () => {
		const session: LeadQASession = [
			{ questionKey: "question-1", question: "Q1", answer: "A1", authorRole: LEAD_QA_ROLE.CALLER, authorId: "u1" },
			{ questionKey: "question-2", question: "Q2", answer: "A2", authorRole: LEAD_QA_ROLE.CLOSER, authorId: "u2" },
		];
		expect(session).toHaveLength(2);
	});

	it("leads.questions default is an empty array", () => {
		expect(leads.questions.default).toEqual([]);
	});

	it("state default is the sin asignar enum value", () => {
		expect(leads.state.default).toBe(LEAD_STATE.SIN_ASIGNAR);
	});

	it("starts new leads in the new pool with zero no-contact impacts", () => {
		expect(leads.poolStatus.default).toBe("new");
		expect(leads.noContactImpactCount.default).toBe(0);
	});

	it("stores optional current acquisition attribution", () => {
		expect(leads.source).toBeDefined();
		expect(leads.campaign).toBeDefined();
		expect(leads.ad).toBeDefined();
		expect(leads.creative).toBeDefined();
		expect(leads.acquisitionAngle).toBeDefined();
		expect(leads.source.notNull).toBe(false);
		expect(leads.campaign.notNull).toBe(false);
		expect(leads.ad.notNull).toBe(false);
		expect(leads.creative.notNull).toBe(false);
		expect(leads.acquisitionAngle.notNull).toBe(false);
	});

	it("allows imported leads without a unique email and stores hidden UTM content", () => {
		expect(leads.email.notNull).toBe(false);
		expect(leads.email.isUnique).toBe(false);
		expect(leads.utmContent).toBeDefined();
		expect(leads.utmContent.notNull).toBe(false);
	});

	it("generates attribution columns and widens the activity-kind constraint", () => {
		const migration = readFileSync(
			new URL("../migrations/0027_misty_prodigy.sql", import.meta.url),
			"utf8",
		);
		const snapshot = readFileSync(
			new URL("../migrations/meta/0027_snapshot.json", import.meta.url),
			"utf8",
		);
		expect(migration).toContain('ADD COLUMN "ad" text');
		expect(migration).toContain('ADD COLUMN "creative" text');
		expect(migration).toContain('ADD COLUMN "acquisition_angle" text');
		expect(migration).toContain("'lead_attribution_updated'");
		expect(migration).toContain("lead_activity_events_append_only");
		expect(migration).toContain("BEFORE UPDATE OR DELETE");
		expect(migration).toContain("pg_trigger_depth() > 1");
		expect(migration).toContain("OLD.actor_id IS NOT NULL");
		expect(migration).toContain("NEW.actor_id IS NULL");
		expect(migration).toContain("to_jsonb(NEW) - 'actor_id'");
		expect(migration).toContain(
			"lead activity events are immutable within a living lead aggregate",
		);
		expect(migration).not.toContain('ON DELETE restrict');
		expect(snapshot).toContain('"onDelete": "cascade"');
		expect(snapshot).toContain('"onDelete": "set null"');
	});
});
