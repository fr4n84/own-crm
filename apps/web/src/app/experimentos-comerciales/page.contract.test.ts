import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
const internalSource = readFileSync(resolve(__dirname, "../observatorio-comercial/experimentos-comerciales/page.tsx"), "utf8");
const layoutSource = readFileSync(resolve(__dirname, "../observatorio-comercial/layout.tsx"), "utf8");

describe("commercial experiments legacy route", () => {
  it("redirects safely to the observatory internal tab without duplicating UI", () => {
    expect(source).toContain('redirect("/observatorio-comercial/experimentos-comerciales")');
    expect(source).not.toContain("commercialExperiments.list");
    expect(source).not.toContain("useQuery");
  });
  it("mounts one reused panel under the observatory layout", () => {
    expect(internalSource).toContain("CommercialExperimentsPanel");
    expect(layoutSource).toContain("CommercialObservatoryNavigation");
    expect(internalSource).not.toContain("commercialExperiments.list");
  });
});
