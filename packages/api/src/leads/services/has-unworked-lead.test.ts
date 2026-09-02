import { describe, it, expect } from "vitest";

import { LEAD_STATE, type LeadState } from "@crm-fran/db/schema/state";

import { hasUnworkedLead } from "./has-unworked-lead";

type LeadStateOnly = { state: LeadState };

describe("hasUnworkedLead", () => {
  it("returns true when there is at least one lead in SIN_ASIGNAR state", () => {
    const leads: LeadStateOnly[] = [
      { state: LEAD_STATE.SIN_ASIGNAR },
    ];
    expect(hasUnworkedLead(leads)).toBe(true);
  });

  it("returns true when mixed states include SIN_ASIGNAR", () => {
    const leads: LeadStateOnly[] = [
      { state: LEAD_STATE.ASIGNADO },
      { state: LEAD_STATE.SIN_ASIGNAR },
      { state: LEAD_STATE.NUMERO_ERRONEO },
    ];
    expect(hasUnworkedLead(leads)).toBe(true);
  });

  it("returns false when all leads are in ASIGNADO state", () => {
    const leads: LeadStateOnly[] = [
      { state: LEAD_STATE.ASIGNADO },
      { state: LEAD_STATE.ASIGNADO },
    ];
    expect(hasUnworkedLead(leads)).toBe(false);
  });

  it("returns false when all leads are in NUMERO_ERRONEO state", () => {
    const leads: LeadStateOnly[] = [
      { state: LEAD_STATE.NUMERO_ERRONEO },
    ];
    expect(hasUnworkedLead(leads)).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(hasUnworkedLead([])).toBe(false);
  });
});
