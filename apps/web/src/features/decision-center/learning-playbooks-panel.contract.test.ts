import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "learning-playbooks-panel.tsx"),
  "utf8",
);

describe("learning playbooks integrated panel", () => {
  it("preserves the four methodology tabs and every lifecycle state", () => {
    for (const value of [
      "Señales detectadas",
      "Propuestas editables",
      "Publicados e historial",
      "Confianza y metodología",
      "Cargando",
      "No se pudo cargar",
      "Sin señales",
      "Evidencia insuficiente",
      "desactualizada",
      "draft",
      "approved",
      "rejected",
    ]) {
      expect(source).toContain(value);
    }
  });

  it("preserves edit, approval, rejection and rollback with mandatory reasons", () => {
    for (const value of [
      "Editar propuesta",
      "Aprobar y publicar",
      "Rechazar propuesta",
      "Restaurar como nueva versión",
      "Motivo obligatorio",
      "proposalHistory",
      "Evidencia congelada",
      "Decisión humana registrada",
    ]) {
      expect(source).toContain(value);
    }
    expect(source).not.toContain("proposal.actorId");
    expect(source).not.toContain("proposal.decisionById");
  });

  it("keeps admin gating and deterministic privacy limits", () => {
    expect(source).toContain("resolveAdminPageAccess");
    expect(source).toContain("Acceso restringido");
    expect(source).toContain("No analiza transcripciones");
    expect(source).toContain("nunca demuestra causalidad");
    expect(source).toContain("no publica automáticamente");
    expect(source).not.toMatch(/scoring técnico|embeddings|generative ai/i);
  });
});
