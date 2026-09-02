import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("personal leads routes", () => {
  it("uses a canonical Spanish route and keeps the legacy path compatible", () => {
    const canonical = readFileSync("src/app/leads-personales/page.tsx", "utf8");
    const legacy = readFileSync("src/app/leads/page.tsx", "utf8");
    expect(canonical).toContain("AssignedLeadsTable");
    expect(legacy).toContain("AssignedLeadsTable");
  });
});
