import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("general leads route contract", () => {
  it("keeps the Spanish route canonical and redirects the legacy route", () => {
    expect(readFileSync("src/app/leads-generales/page.tsx", "utf8")).toContain("LeadAssignmentQueue");
    expect(readFileSync("src/app/general-leads/page.tsx", "utf8")).toContain('redirect("/leads-generales")');
  });
});
