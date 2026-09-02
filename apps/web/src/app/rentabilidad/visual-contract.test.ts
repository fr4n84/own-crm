import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/rentabilidad/page.tsx", "utf8");

describe("Profitability Arc visual contract", () => {
  it("uses a genuinely compact analysis interval toolbar", () => {
    expect(source).toContain('Card size="sm" className="w-fit max-w-full"');
    expect(source).toContain("sm:flex-row sm:items-end");
    expect(source).toContain("dashboard-arc-theme");
  });

  it("keeps currency isolation and accessible information targets", () => {
    expect(source).toContain("Las monedas se analizan por separado");
    expect(source).toContain('className="size-11"');
  });
});
