import { describe, it, expect } from "vitest";

import { LEAD_STATE, type LeadState } from "@crm-fran/db/schema/state";

import { hasUnworkedLead } from "./has-unworked-lead";

type LeadStateOnly = { state: LeadState };

const activation = new Date("2026-09-05T10:00:00.000Z");

type GuardedLead = LeadStateOnly & { callerAssignedAt: Date | null };

describe("hasUnworkedLead", () => {
  it("returns true when there is at least one lead in SIN_ASIGNAR state", () => {
    const leads: GuardedLead[] = [
      { state: LEAD_STATE.SIN_ASIGNAR, callerAssignedAt: new Date("2026-09-05T10:01:00.000Z") },
    ];
    expect(hasUnworkedLead(leads, activation)).toBe(true);
  });

  it("returns true when mixed states include SIN_ASIGNAR", () => {
    const leads: GuardedLead[] = [
      { state: LEAD_STATE.ASIGNADO, callerAssignedAt: new Date("2026-09-05T10:01:00.000Z") },
      { state: LEAD_STATE.SIN_ASIGNAR, callerAssignedAt: new Date("2026-09-05T10:02:00.000Z") },
      { state: LEAD_STATE.NUMERO_ERRONEO, callerAssignedAt: new Date("2026-09-05T10:03:00.000Z") },
    ];
    expect(hasUnworkedLead(leads, activation)).toBe(true);
  });

  it("returns false when all leads are in ASIGNADO state", () => {
    const leads: GuardedLead[] = [
      { state: LEAD_STATE.ASIGNADO, callerAssignedAt: new Date("2026-09-05T10:01:00.000Z") },
      { state: LEAD_STATE.ASIGNADO, callerAssignedAt: new Date("2026-09-05T10:02:00.000Z") },
    ];
    expect(hasUnworkedLead(leads, activation)).toBe(false);
  });

  it("returns false when all leads are in NUMERO_ERRONEO state", () => {
    const leads: GuardedLead[] = [
      { state: LEAD_STATE.NUMERO_ERRONEO, callerAssignedAt: new Date("2026-09-05T10:01:00.000Z") },
    ];
    expect(hasUnworkedLead(leads, activation)).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(hasUnworkedLead([], activation)).toBe(false);
  });

  it("does not let historical unmarked leads block future assignments", () => {
    expect(hasUnworkedLead([
      { state: LEAD_STATE.SIN_ASIGNAR, callerAssignedAt: null },
    ], activation)).toBe(false);
  });

  it("does not let assignments before activation block", () => {
    expect(hasUnworkedLead([
      { state: LEAD_STATE.SIN_ASIGNAR, callerAssignedAt: new Date("2026-09-05T09:59:59.999Z") },
    ], activation)).toBe(false);
  });

  it("treats an assignment exactly at activation as governed", () => {
    expect(hasUnworkedLead([
      { state: LEAD_STATE.SIN_ASIGNAR, callerAssignedAt: activation },
    ], activation)).toBe(true);
  });
});
