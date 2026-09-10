import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricExplanation, MetricExplanationGroup } from "./metric-explanation";

function explanation(id: string, title: string) {
  return {
    id,
    version: "observatory-metric-explanations-v1",
    title,
    meaning: `${title}: significado.`,
    formula: `${title}: fórmula.`,
    unit: "Índice",
    sources: ["Asignaciones"],
    period: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
      asOf: "2026-02-01T00:00:00.000Z",
      timeZone: "Europe/Madrid",
      boundary: "[desde, hasta)",
    },
    syntheticExample: { scenario: `${title}: escenario.`, result: `${title}: resultado.` },
    limitations: [`${title}: no demuestra causalidad.`],
    evidence: {
      dataQuality: { state: "available" as const, explanation: `${title}: calidad individual.` },
      statisticalConfidence: { state: "descriptive" as const, explanation: `${title}: confianza individual.` },
    },
    humanRecommendation: `${title}: recomendación humana.`,
  };
}

describe("MetricExplanation", () => {
  it("opens an accessible complete explanation", () => {
    render(<MetricExplanation explanation={explanation("risk.hhi", "HHI")} />);

    fireEvent.click(screen.getByRole("button", { name: "Explicar HHI" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("HHI: fórmula.")).toBeInTheDocument();
    expect(screen.getByText("Calidad de datos")).toBeInTheDocument();
    expect(screen.getByText("Confianza estadística")).toBeInTheDocument();
    expect(screen.getByText("HHI: recomendación humana.")).toBeInTheDocument();
  });

  it("groups related explanations behind one affordance without losing per-metric evidence", () => {
    render(
      <MetricExplanationGroup
        label="Explicar cambio de ventas"
        title="Cambio de ventas"
        explanations={[
          explanation("bridge.volume_contribution", "Contribución de volumen"),
          explanation("bridge.conversion_contribution", "Contribución de conversión"),
        ]}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Explicar cambio de ventas" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Explicar cambio de ventas" }));

    expect(screen.getByRole("dialog", { name: "Cambio de ventas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contribución de volumen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contribución de conversión" })).toBeInTheDocument();
    expect(screen.getByText("Contribución de volumen: calidad individual.")).toBeInTheDocument();
    expect(screen.getByText("Contribución de conversión: calidad individual.")).toBeInTheDocument();
    expect(screen.getByText("Contribución de volumen: confianza individual.")).toBeInTheDocument();
    expect(screen.getByText("Contribución de conversión: confianza individual.")).toBeInTheDocument();
  });
});
