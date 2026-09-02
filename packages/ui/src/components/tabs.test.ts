import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./tabs.tsx", import.meta.url), "utf8");

describe("shared tabs height", () => {
  it("keeps enough height at desktop breakpoints for complete labels", () => {
    expect(source).toContain("group-data-horizontal/tabs:h-12");
    expect(source).not.toContain("sm:group-data-horizontal/tabs:h-8");
    expect(source).not.toContain("sm:min-h-0");
  });
});
