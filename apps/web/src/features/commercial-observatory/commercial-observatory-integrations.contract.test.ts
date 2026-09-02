import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

describe("Observatory integrations", () => {
  it("uses reusable Intelligence and Feedback panels with legacy redirects", () => {
    expect(read("../../app/observatorio-comercial/inteligencia/page.tsx")).toContain("CommercialIntelligencePanel");
    expect(read("../../app/observatorio-comercial/feedback/page.tsx")).toContain("FeedbackStatisticsView");
    expect(read("../../app/inteligencia-comercial/page.tsx")).toContain('redirect("/observatorio-comercial/inteligencia")');
    expect(read("../../app/feedback-statistics/page.tsx")).toContain('redirect("/observatorio-comercial/feedback")');
  });

  it("keeps both integrations Arc-dense and free from raw color utilities", () => {
    const source = `${read("commercial-intelligence-panel.tsx")}\n${read("../feedback-statistics/feedback-statistics-view.tsx")}`;
    expect(source).toContain("bg-muted/40");
    expect(source).toContain("max-h-");
    expect(source).toContain("text-muted-foreground");
    expect(source).not.toMatch(/(?:bg|text|border)-(?:blue|red|green|yellow|gray|slate|zinc|neutral|stone)-\d{2,3}/);
  });
});
