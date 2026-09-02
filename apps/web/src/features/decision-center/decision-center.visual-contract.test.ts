import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const decisionSource = readFileSync(
  resolve(__dirname, "../../app/centro-de-decisiones/page.tsx"),
  "utf8",
);
const askSource = readFileSync(resolve(__dirname, "ask-crm-panel.tsx"), "utf8");
const navigationSource = readFileSync(
  resolve(__dirname, "decision-center-navigation.tsx"),
  "utf8",
);
const layoutSource = readFileSync(
  resolve(__dirname, "../../app/centro-de-decisiones/layout.tsx"),
  "utf8",
);
const playbooksSource = readFileSync(
  resolve(__dirname, "learning-playbooks-panel.tsx"),
  "utf8",
);
const combined = `${decisionSource}\n${askSource}\n${playbooksSource}\n${navigationSource}\n${layoutSource}`;

describe("decision centre Arc visual contract", () => {
  it("uses real shadcn tabs, complete cards and semantic Arc tokens", () => {
    for (const token of ["TabsList", "TabsTrigger", "CardHeader", "CardContent", "bg-background", "text-muted-foreground"]) {
      expect(combined).toContain(token);
    }
    expect(combined).not.toMatch(/(?:bg|text|border|ring)-(?:blue|red|green|yellow|gray|slate|zinc|neutral|stone)-\d{2,3}/);
    expect(combined).not.toMatch(/space-[xy]-/);
  });

  it("keeps dense responsive layouts and accessible information controls", () => {
    expect(combined).toContain("decision-center-arc-theme");
    expect(combined).toMatch(/(?:sm|md|lg|xl):grid-cols-/);
    expect(combined).toContain('className="size-11"');
    expect(combined).toContain("aria-label={`Información sobre ${title}`}");
  });

  it("renders balanced 48px clean tabs with a semantic yellow active state", () => {
    expect(navigationSource).toContain("h-12! min-h-12!");
    expect(navigationSource).toContain("data-active:bg-accent");
    expect(navigationSource).toContain("after:hidden");
    expect(navigationSource).not.toContain('variant="line"');
    expect(navigationSource).not.toContain("overflow-x-auto");
    expect(navigationSource).not.toMatch(/Arrow(?:Up|Down)|Chevron(?:Up|Down)|spinbutton/);
  });

  it("keeps the integrated Playbooks panel on compact Arc cards", () => {
    expect(playbooksSource).toContain('className="rounded-lg shadow-sm"');
    expect(playbooksSource).toContain('className="size-11"');
    expect(playbooksSource).not.toContain("<main");
    expect(playbooksSource).not.toMatch(/<Card[^>]*size="sm"[^>]*size="sm"/);
  });
});
