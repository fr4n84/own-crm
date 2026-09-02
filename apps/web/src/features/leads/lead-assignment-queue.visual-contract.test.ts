import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/leads/lead-assignment-queue.tsx", "utf8");

describe("general leads Arc visual contract", () => {
  it("uses Arc hierarchy, segmented tabs, search and bounded responsive data", () => {
    for (const token of ["dashboard-arc-theme", "bg-muted/40", "h-11!", "Buscar leads", "max-h-", "overflow-auto"]) expect(source).toContain(token);
    expect(source).not.toContain('variant="line"');
    expect(source).not.toMatch(/(?:bg|text|border)-(?:blue|red|green|yellow|gray|slate|zinc|neutral|stone)-\d{2,3}/);
  });

  it("shows separate VSL tabs for exhausted impacts and wrong numbers", () => {
    expect(source).toContain("3 impactos");
    expect(source).toContain("Número erróneo");
    expect(source).toContain('type === "vsl"');
  });
});
