import { describe, expect, it } from "vitest";

import { requiresScheduledContact } from "./closer-follow-up";

describe("requiresScheduledContact", () => {
  it.each(["Reagenda", "Seguimiento"])("requires date and time for %s", (outcome) => {
    expect(requiresScheduledContact(outcome)).toBe(true);
  });

  it("does not require a date for a terminal result", () => {
    expect(requiresScheduledContact("Venta")).toBe(false);
  });
});
