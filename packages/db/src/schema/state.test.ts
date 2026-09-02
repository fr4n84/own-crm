import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LEAD_STATE, leadStateEnum, type LeadState } from "./state";

describe("LEAD_STATE", () => {
	it("has the three expected states", () => {
		expect(LEAD_STATE.SIN_ASIGNAR).toBe("sin asignar");
		expect(LEAD_STATE.ASIGNADO).toBe("Asignado");
		expect(LEAD_STATE.NUMERO_ERRONEO).toBe("número erróneo");
	});

	it("LeadState type accepts only the enum values", () => {
		const valid: LeadState = LEAD_STATE.ASIGNADO;
		expect(valid).toBe("Asignado");
	});

	it("Zod enum accepts valid states", () => {
		expect(leadStateEnum.parse(LEAD_STATE.SIN_ASIGNAR)).toBe("sin asignar");
		expect(leadStateEnum.parse(LEAD_STATE.ASIGNADO)).toBe("Asignado");
		expect(leadStateEnum.parse(LEAD_STATE.NUMERO_ERRONEO)).toBe("número erróneo");
	});

	it("Zod enum rejects invalid states", () => {
		expect(() => leadStateEnum.parse("invalid")).toThrow();
		expect(() => leadStateEnum.parse("")).toThrow();
	});
});

describe("migration CHECK constraint", () => {
	it("0006 migration includes a CHECK constraint for the three states", async () => {
		const migrationPath = resolve(
			import.meta.dirname,
			"../migrations/0006_leads_state_check_constraint.sql",
		);
		const sql = await readFile(migrationPath, "utf-8");

		expect(sql).toContain("leads_state_check");
		expect(sql).toContain("sin asignar");
		expect(sql).toContain("Asignado");
		expect(sql).toContain("número erróneo");
	});
});
