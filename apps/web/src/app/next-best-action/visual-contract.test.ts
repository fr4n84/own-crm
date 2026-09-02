import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/next-best-action/page.tsx", "utf8");
const view = readFileSync("src/features/alerts/next-best-action-view.tsx", "utf8");

describe("next best action Arc visual contract", () => {
  it("renders an accessible stable work-mode selector with an explanation", () => {
    expect(page).toContain("Modo de trabajo");
    expect(page).toContain("next-best-action-work-mode");
    expect(page).toContain("Información sobre el modo de trabajo");
    expect(page).toContain("useNextBestActionModes");
    expect(page).toContain("El servidor valida siempre el rol autenticado");
  });

  it("uses compact Arc cards and a bounded responsive queue", () => {
    expect(page).toContain("dashboard-arc-theme");
    expect(page).toContain("Card");
    expect(view).toContain("max-h-96 overflow-auto");
    expect(view).toContain("text-muted-foreground");
    expect(`${page}\n${view}`).not.toMatch(/(?:bg|text|border)-(?:blue|red|green|yellow|gray|slate|zinc|neutral|stone)-\d{2,3}/);
  });
});
