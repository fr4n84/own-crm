import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("server environment validation", () => {
  it("does not print environment values or credential metadata", () => {
    const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("[ENV DEBUG]");
  });
});
