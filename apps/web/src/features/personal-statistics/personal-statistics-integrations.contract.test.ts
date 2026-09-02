import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

describe("Personal statistics integrations", () => {
  it("hosts rankings in a reusable internal route and redirects legacy routes", () => {
    expect(read("../../app/estadisticas-personales/rankings/page.tsx")).toContain("RankingsView");
    expect(read("../../app/rankings/page.tsx")).toContain('redirect("/estadisticas-personales/rankings")');
    expect(read("../../app/personal-statistics/page.tsx")).toContain('redirect("/estadisticas-personales")');
  });

  it("uses compact 48px semantic tabs without a line indicator", () => {
    const navigation = read("personal-statistics-navigation.tsx");
    expect(navigation).toContain("h-12!");
    expect(navigation).toContain("data-active:bg-accent");
    expect(navigation).toContain("after:hidden");
    expect(navigation).not.toContain('variant="line"');
  });
});
