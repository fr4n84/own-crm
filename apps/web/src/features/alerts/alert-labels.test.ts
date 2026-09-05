import { describe, expect, it } from "vitest";

import { getAlertKindLabel, getAlertSeverityLabel } from "./alert-labels";

describe("alert labels", () => {
  it("renders every persisted severity and kind in Spanish", () => {
    expect(getAlertSeverityLabel("urgent")).toBe("Alta");
    expect(getAlertSeverityLabel("warning")).toBe("Media");
    expect(getAlertSeverityLabel("info")).toBe("Baja");
    expect(getAlertKindLabel("no_contact")).toBe("Sin contacto");
    expect(getAlertKindLabel("future_call")).toBe("Llamar futuro");
  });

  it("never leaks raw unknown identifiers", () => {
    expect(getAlertSeverityLabel("internal_severity_id")).toBe("Relevancia desconocida");
    expect(getAlertKindLabel("internal_kind_id")).toBe("Tipo desconocido");
  });
});
