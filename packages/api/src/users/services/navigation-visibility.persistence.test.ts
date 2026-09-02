import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./navigation-visibility.ts", import.meta.url), "utf8");

describe("navigation visibility persistence contract", () => {
  it("uses a transaction and optimistic compare-and-swap", () => {
    expect(source).toContain("db.transaction");
    expect(source).toContain("input.expectedVersion + 1");
    expect(source).toContain("eq(navigationVisibilitySettings.version, input.expectedVersion)");
    expect(source).toContain('code: "CONFLICT"');
  });

  it("falls back only when the settings table is not deployed", () => {
    expect(source).toContain('candidate.code === "42P01"');
    expect(source).toContain("configured: false, version: 0");
    expect(source).toContain('code: "PRECONDITION_FAILED"');
  });
});
