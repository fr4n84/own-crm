import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/observatorio-comercial/page.tsx"), "utf8");

describe("commercial observatory page", () => {
  it("renders all four explainable sections and honest UI states", () => {
    for (const label of ["Observatorio comercial", "Estacionalidad", "Radar de anomalías", "Puente explicativo", "Mapa de dependencia y riesgo"]) expect(source).toContain(label);
    for (const state of ["Cargando observatorio", "No se pudo cargar", "Sin observaciones", "Evidencia insuficiente", "Monedas no comparables", "No comparable"]) expect(source).toContain(state);
    expect(source).toContain("contribución aritmética");
    expect(source).toContain("No implica causalidad");
    expect(source).toContain("trpc.commercialObservatory.overview");
    expect(source).not.toContain("asIso(");
    expect(source).not.toContain("T23:59:59");
    expect(source).toContain("inclusiveEndLabel");
    expect(source).toContain("getTime() - 1");
    expect(source).toContain("No evaluable sin moneda");
  });

  it("has no currency selector, keeps a compact period and explains dependency risk deeply", () => {
    expect(source).not.toContain("setCurrency");
    expect(source).not.toContain("Selecciona una moneda");
    expect(source).not.toContain("Periodo y moneda");
    expect(source).toContain('className="h-7 w-36 px-2"');
    for (const detail of ["Top 1", "Top 3", "HHI", "fuente", "campaña", "caller", "closer", "perfil", "descriptivo", "no demuestra causalidad"]) expect(source).toContain(detail);
    expect(source).toContain('informationLabel="Información detallada sobre el mapa de dependencia y riesgo"');
  });
});
