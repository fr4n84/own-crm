import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readWorkspaceFile(path: string) {
  return readFileSync(resolve(webRoot, path), "utf8");
}

describe("Dashboard visual contract", () => {
  it("places the compact visitors chart before the conversion funnel", () => {
    const dashboard = readWorkspaceFile("src/components/dashboard.tsx");
    const summaryPosition = dashboard.indexOf("<DashboardSummaryCards />");
    const visitorsPosition = dashboard.indexOf("<ChartAreaInteractive />");
    const funnelPosition = dashboard.indexOf("<ConversionFunnel />");

    expect(summaryPosition).toBeGreaterThan(-1);
    expect(visitorsPosition).toBeGreaterThan(summaryPosition);
    expect(visitorsPosition).toBeGreaterThan(-1);
    expect(funnelPosition).toBeGreaterThan(visitorsPosition);
    expect(dashboard).toContain('className="dashboard-arc-theme');

    const chart = readWorkspaceFile(
      "../../packages/ui/src/components/chart-area-interactive.tsx",
    );
    expect(chart).toContain('className="aspect-auto h-[160px] w-full sm:h-[180px]"');
    expect(chart).toContain('<Card size="sm" className="@container/card"');
  });

  it("queries both summary intervals in parallel and owns honest states", () => {
    const summary = readWorkspaceFile("src/features/dashboard/dashboard-summary-cards.tsx");

    expect(summary).toContain("useQueries");
    expect(summary).toContain("dashboardSummaryQueryInputs");
    expect(summary).toContain("Cargando estadísticas");
    expect(summary).toContain("No se pudieron cargar las estadísticas");
    expect(summary).toContain("Base de comparación 0; porcentaje no comparable");
    expect(summary).toContain("sm:grid-cols-2 xl:grid-cols-4");
  });

  it("keeps the funnel responsive while reducing its vertical footprint", () => {
    const funnel = readWorkspaceFile("src/features/dashboard/conversion-funnel.tsx");

    expect(funnel).toContain("md:grid-cols-5");
    expect(funnel).toContain('<Card size="sm" className="h-full bg-primary/5"');
    expect(funnel).toContain('className="flex flex-col gap-4"');
    expect(funnel).not.toContain('className="flex flex-col items-center gap-2"');
  });

  it("moves the funnel explanation into an accessible compact information control", () => {
    const funnel = readWorkspaceFile("src/features/dashboard/conversion-funnel.tsx");

    expect(funnel).toContain('<Information title="Embudo de conversión">');
    expect(funnel).toContain("Sigue la evolución posterior de los leads asignados dentro del intervalo.");
    expect(funnel).toContain('aria-label={`Información sobre ${title}`}');
    expect(funnel).toContain('size="icon-xs"');
    expect(funnel).toContain('className="size-11"');
    expect(funnel).toContain("<PopoverDescription>{children}</PopoverDescription>");
  });

  it("maps the complete Dashboard to the DESIGN.md Arc palette", () => {
    const styles = readWorkspaceFile("src/index.css");

    expect(styles).toContain(".dashboard-arc-theme");
    expect(styles).toContain("--primary: #3139fb");
    expect(styles).toContain("--card: #fffcec");
    expect(styles).toContain("--accent: #fffadd");
    expect(styles).toContain("--border: #3139fb");
  });

  it("keeps portalled Dashboard controls inside the Arc visual scope", () => {
    const chart = readWorkspaceFile(
      "../../packages/ui/src/components/chart-area-interactive.tsx",
    );
    const funnel = readWorkspaceFile("src/features/dashboard/conversion-funnel.tsx");
    const quality = readWorkspaceFile("src/features/dashboard/quality-controls.tsx");

    expect(chart).toContain('className="dashboard-arc-theme rounded-xl"');
    expect(funnel.match(/className="dashboard-arc-theme/g)?.length).toBeGreaterThanOrEqual(4);
    expect(quality.match(/className="dashboard-arc-theme/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps quality controls compact and moves its explanation to an accessible info control", () => {
    const quality = readWorkspaceFile("src/features/dashboard/quality-controls.tsx");

    expect(quality).toContain('<Information title="Controles de calidad">');
    expect(quality).toContain(
      "Señales informativas calculadas desde la actividad real de los leads. No generan alertas ni acciones automáticas.",
    );
    expect(quality).toContain('aria-label={`Información sobre ${title}`}');
    expect(quality).toContain('size="icon-xs"');
    expect(quality).toContain('className="size-11"');
    expect(quality).toContain('<CardContent className="flex flex-col gap-4">');
    expect(quality).toContain('className="grid gap-3 lg:grid-cols-3"');
    expect(quality).toContain('className="flex max-h-48 flex-col gap-1.5 overflow-auto"');
    expect(quality).not.toContain('className="flex flex-col gap-6"');
    expect(quality).not.toContain('className="h-72 w-full"');
    expect(quality).not.toContain('className="truncate');
    expect(quality.match(/break-words/g)?.length).toBeGreaterThanOrEqual(2);
    expect(quality).toContain('className="break-all text-xs text-muted-foreground"');
  });
});
