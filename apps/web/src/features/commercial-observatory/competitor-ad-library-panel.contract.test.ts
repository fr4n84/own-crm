import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const panel = read("src/features/commercial-observatory/competitor-ad-library-panel.tsx");
const view = read("src/features/commercial-observatory/advertising-library-view.tsx");
const page = read("src/app/observatorio-comercial/biblioteca-publicitaria/page.tsx");
const navigation = read("src/features/commercial-observatory/commercial-observatory-navigation.tsx");

describe("competitor Ad Library user interface", () => {
  it("shows competitor evidence and honest metric provenance", () => {
    for (const label of [
      "Inteligencia de competidores",
      "Anuncios activos",
      "Nuevos",
      "Modificados",
      "Inactivos",
      "Primera observación",
      "Última observación",
      "Plataformas",
      "Estimado",
      "Rango",
      "No disponible",
      "Historial de sincronización diaria",
    ]) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain("trpc.competitorAds.overview");
    expect(panel).not.toContain("failureCodes");
    expect(panel).not.toContain("/api/internal/competitor-ads/daily-sync");
  });

  it("exposes configuration only to Admin and keeps the Observatory readable", () => {
    expect(view).toContain('permissions.includes("*")');
    expect(panel).toContain("trpc.competitorAds.saveSource");
    expect(panel).toContain("trpc.competitorAds.setSourceEnabled");
    expect(page).toContain('<Can permission="leads:read">');
    expect(navigation).toMatch(/marketing-library[\s\S]*permission: "leads:read"/);
  });
});
