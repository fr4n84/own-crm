import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const legacy = readFileSync(resolve(process.cwd(), "src/app/planificacion-comercial/page.tsx"), "utf8");
const internal = readFileSync(resolve(process.cwd(), "src/app/observatorio-comercial/planificacion/page.tsx"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/features/commercial-observatory/commercial-planning-panel.tsx"), "utf8");

describe("commercial planning internal tab", () => {
  it("redirects the legacy route and reuses one internal panel", () => {
    expect(legacy).toContain('redirect("/observatorio-comercial/planificacion")');
    expect(legacy).not.toContain("commercialPlanning.overview");
    expect(internal).toContain("CommercialPlanningPanel");
  });
  it("shows the three planning blocks, editable assumptions and honest states", () => {
    const source = panel;
    for (const title of ["Planificación comercial", "Proyección 30/60/90", "Capacidad y contratación", "Comisiones e incentivos", "Escenario", "Base observada"]) expect(source).toContain(title);
    for (const state of ["Cargando planificación", "No se pudo cargar", "Sin observaciones", "Evidencia insuficiente"]) expect(source).toContain(state);
    for (const detail of ["Simulación condicionada", "No es una predicción", "No crea usuarios", "No ejecuta pagos", "Costes no modelados", "observed", "introduced"]) expect(source).toContain(detail);
    expect(source).toContain("trpc.commercialPlanning.overview");
    expect(source).toContain("seasonalityEnabled");
    expect(source).toContain("Capacidad insuficiente");
  });
  it("removes currency controls and keeps every calculation separated without FX", () => {
    expect(panel).not.toContain("setCurrency");
    expect(panel).not.toContain("planning-currency");
    expect(panel).not.toContain("Moneda histórica");
    expect(panel).toContain("availableCurrencies.map");
    expect(panel).toContain("Cada moneda se simula y presenta por separado");
    expect(panel).toContain("No se aplica FX");
  });
  it("keeps Scenario compact and all editable inputs visible", () => {
    expect(panel).toContain('aria-label="Escenario editable"');
    expect(panel).toContain("md:grid-cols-2");
    expect(panel).toContain('className="h-8"');
    for (const id of ["lead-volume", "appointment-rate", "sale-rate", "collection", "refund", "direct-cost", "ad-spend", "seasonality"]) expect(panel).toContain(`id="${id}`);
  });
});
