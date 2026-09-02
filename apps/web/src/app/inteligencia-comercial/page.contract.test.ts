import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial intelligence phase-three UI contract", () => {
  const source = readFileSync("src/features/commercial-observatory/commercial-intelligence-panel.tsx", "utf8");

  it("keeps the original tabs and adds objection intelligence and library", () => {
    for (const label of ["Asignación simulada", "Aprendizaje", "Fugas", "Objeciones y motivaciones", "Biblioteca comercial inteligente"]) expect(source).toContain(label);
    expect(source).toContain("bg-muted/40");
    expect(source).toContain("h-11!");
  });

  it("renders loading, error, empty and human approval states", () => {
    expect(source).toContain("objectionQuery.isPending");
    expect(source).toContain("libraryQuery.isError");
    expect(source).toContain("Biblioteca vacía");
    expect(source).toContain("Publicar con aprobación humana");
    expect(source).not.toContain("extraInfo");
  });

  it("never presents an experiment as causal evidence", () => {
    expect(source).toContain("respaldado por experimento, nunca como evidencia causal");
    expect(source).not.toContain("Solo se etiqueta causal");
    expect(source).toContain("commercialUiLabel(item.evidence.evidenceLabel");
  });
});
