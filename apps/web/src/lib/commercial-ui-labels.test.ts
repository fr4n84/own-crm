import { describe, expect, it } from "vitest";

import { commercialUiLabel } from "./commercial-ui-labels";

describe("commercial UI labels", () => {
  it("translates stored technical identifiers before rendering them", () => {
    expect(commercialUiLabel("observational_gap")).toBe("Brecha observacional");
    expect(commercialUiLabel("experiment_supported")).toBe("Respaldada por experimento");
    expect(commercialUiLabel("policy_default")).toBe("Valor de política");
    expect(commercialUiLabel("within_expected_range")).toBe("Dentro del rango esperado");
    expect(commercialUiLabel("delta_margin")).toBe("Variación de margen");
    expect(commercialUiLabel("profile+subprofile+source+campaign")).toBe("Perfil, subperfil, fuente y campaña");
    expect(commercialUiLabel("acquisitionAngle")).toBe("Ángulo de adquisición");
    expect(commercialUiLabel("motivation")).toBe("Motivación");
    expect(commercialUiLabel("missing")).toBe("Sin información");
  });
});
