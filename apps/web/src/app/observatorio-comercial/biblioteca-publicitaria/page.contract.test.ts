import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(
  resolve(
    process.cwd(),
    "src/features/commercial-observatory/marketing-library-panel.tsx",
  ),
  "utf8",
);
const navigation = readFileSync(
  resolve(
    process.cwd(),
    "src/features/commercial-observatory/commercial-observatory-navigation.tsx",
  ),
  "utf8",
);

describe("marketing library observatory tab", () => {
  it("exposes coverage, unmapped codes, mappings and performance", () => {
    for (const label of [
      "Biblioteca publicitaria",
      "Cobertura UTM",
      "Códigos pendientes",
      "Relaciones activas",
      "Rendimiento",
    ]) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain("trpc.marketingAttribution.overview");
    expect(panel).toContain("/api/marketing-assets");
    expect(panel).toContain("analyzeTranscript");
    expect(panel).toContain("saveMapping");
  });

  it("registers the new URL-backed observatory tab", () => {
    expect(navigation).toContain("Biblioteca publicitaria");
    expect(navigation).toContain(
      "/observatorio-comercial/biblioteca-publicitaria",
    );
  });
});
