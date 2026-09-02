import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const observatory = readFileSync(resolve(__dirname, "../../app/observatorio-comercial/page.tsx"), "utf8");
const layout = readFileSync(resolve(__dirname, "../../app/observatorio-comercial/layout.tsx"), "utf8");
const navigation = readFileSync(resolve(__dirname, "commercial-observatory-navigation.tsx"), "utf8");
const experiments = readFileSync(resolve(__dirname, "commercial-experiments-panel.tsx"), "utf8");
const evidence = readFileSync(resolve(__dirname, "commercial-evidence-panel.tsx"), "utf8");
const planning = readFileSync(resolve(__dirname, "commercial-planning-panel.tsx"), "utf8");
const intelligence = readFileSync(resolve(__dirname, "commercial-intelligence-panel.tsx"), "utf8");
const feedback = readFileSync(resolve(__dirname, "../feedback-statistics/feedback-statistics-view.tsx"), "utf8");
const combined = `${observatory}\n${layout}\n${navigation}\n${experiments}\n${evidence}\n${planning}\n${intelligence}\n${feedback}`;

describe("commercial observatory Arc visual contract", () => {
  it("uses semantic Arc surfaces, full shadcn composition and responsive density", () => {
    for (const token of ["dashboard-arc-theme", "CardHeader", "CardContent", "TabsList", "TabsTrigger", "bg-background", "text-muted-foreground", "md:grid-cols-2"]) expect(combined).toContain(token);
    expect(combined).not.toMatch(/(?:bg|text|border|ring)-(?:blue|red|green|yellow|gray|slate|zinc|neutral|stone)-\d{2,3}/);
    expect(combined).not.toMatch(/space-[xy]-/);
  });

  it("aligns all internal tabs without arrows or scrolling", () => {
    expect(navigation).toContain("sm:w-fit");
    expect(navigation).toContain("text-sm");
    expect(navigation).toContain("h-12!");
    expect(navigation).toContain("py-2");
    expect(navigation).toContain("items-stretch");
    expect(navigation).not.toContain("overflow-x-auto");
    expect(navigation).not.toMatch(/Chevron|Arrow/);
    expect(navigation).toContain("data-active:bg-accent");
    expect(navigation).toContain("data-active:text-accent-foreground");
    expect(navigation).toContain("after:hidden");
    expect(navigation).not.toContain('variant="line"');
  });

  it("renders secondary tabs as coherent segmented controls with 44px targets", () => {
    for (const source of [observatory, experiments, evidence, planning, intelligence]) {
      expect(source).toContain("bg-muted/40");
      expect(source).toContain("h-11!");
      expect(source).toContain("data-active:bg-background");
      expect(source).toContain("w-fit");
    }
  });

  it("keeps information targets accessible and dense tables bounded", () => {
    expect(combined).toContain('className="size-11"');
    expect(combined).toContain("max-h-96 overflow-auto");
    expect(experiments).toContain("max-h-64 overflow-auto");
    expect(evidence).toContain("max-h-72 overflow-auto");
    expect(navigation).toContain("h-12!");
  });

  it("keeps repeated assignment explanations as distinct React children", () => {
    expect(intelligence).toContain("item.reasons.map((reason, reasonIndex)");
    expect(intelligence).toContain("key={`${item.leadId}:${reasonIndex}:${reason}`}");
    expect(intelligence).not.toContain("key={reason}");
  });

  it("keeps seasonality legible across mobile and desktop without exposing long rules inline", () => {
    expect(observatory).toContain('aria-label="Resumen de evidencia estacional"');
    expect(observatory).toContain('aria-label="Señales estacionales por día"');
    expect(observatory).toContain('label="Información sobre metodología estacional"');
    expect(observatory).toContain("sm:grid-cols-2");
    expect(observatory).toContain("rounded-md border bg-background p-3");
    expect(observatory).not.toContain("md:hidden");
  });

  it("keeps the period toolbar genuinely compact instead of a full-width card", () => {
    expect(observatory).toContain('Card size="sm" className="w-fit max-w-full"');
    expect(observatory).toContain("sm:flex-row sm:items-end");
    expect(observatory).toContain("p-3");
  });
});
