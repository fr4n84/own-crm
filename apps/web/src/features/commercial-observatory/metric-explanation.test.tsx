import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricExplanation } from "./metric-explanation";

describe("MetricExplanation", () => {
  it("opens an accessible complete explanation", () => {
    render(<MetricExplanation explanation={{
      id: "risk.hhi", version: "observatory-metric-explanations-v1", title: "HHI",
      meaning: "Concentración total.", formula: "Suma de cuotas al cuadrado.", unit: "Índice de 0 a 1",
      sources: ["Asignaciones"], period: { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z", asOf: "2026-02-01T00:00:00.000Z", timeZone: "Europe/Madrid", boundary: "[desde, hasta)" },
      syntheticExample: { scenario: "Dos grupos al 50%.", result: "HHI 0,5." }, limitations: ["No demuestra causalidad."],
      evidence: { dataQuality: { state: "available", explanation: "Atribución suficiente." }, statisticalConfidence: { state: "descriptive", explanation: "Es descriptivo." } },
      humanRecommendation: "Revisar antes de redistribuir.",
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Explicar HHI" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Suma de cuotas al cuadrado.")).toBeInTheDocument();
    expect(screen.getByText("Calidad de datos")).toBeInTheDocument();
    expect(screen.getByText("Confianza estadística")).toBeInTheDocument();
    expect(screen.getByText("Revisar antes de redistribuir.")).toBeInTheDocument();
  });
});
