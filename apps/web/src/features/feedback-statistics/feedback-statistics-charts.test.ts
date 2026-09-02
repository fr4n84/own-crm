import { describe, expect, it } from "vitest";

import { buildFeedbackChartData } from "./feedback-statistics-charts";

describe("feedback statistics charts", () => {
  it("builds profile, reaction and motivation distributions", () => {
    const result = buildFeedbackChartData({
      profiles: [
        {
          profile: "latino_extranjero",
          total: 3,
          reactions: {
            appointment: 1,
            future_call: 1,
            not_interested: 1,
            not_fit: 0,
            unknown: 0,
          },
        },
        {
          profile: "parado_desempleado",
          total: 1,
          reactions: {
            appointment: 1,
            future_call: 0,
            not_interested: 0,
            not_fit: 0,
            unknown: 0,
          },
        },
      ],
      angles: [{ angle: "financial_stability", total: 2 }],
      sources: [{ value: "Meta Ads", total: 3 }],
      campaigns: [{ value: "VSL Agosto", total: 2 }],
      profileLabels: { latino_extranjero: "Latino/extranjero", parado_desempleado: "Parado/desempleado" },
      angleLabels: { financial_stability: "Estabilidad financiera" },
    });

    expect(result.profiles).toEqual([
      { key: "latino_extranjero", name: "Latino/extranjero", value: 3 },
      { key: "parado_desempleado", name: "Parado/desempleado", value: 1 },
    ]);
    expect(result.reactions).toEqual([
      { key: "appointment", name: "Agenda", value: 2 },
      { key: "future_call", name: "Llamar a futuro", value: 1 },
      { key: "not_interested", name: "No interesado", value: 1 },
    ]);
    expect(result.angles).toEqual([
      { key: "financial_stability", name: "Estabilidad financiera", value: 2 },
    ]);
    expect(result.sources).toEqual([
      { key: "Meta Ads", name: "Meta Ads", value: 3 },
    ]);
    expect(result.campaigns).toEqual([
      { key: "VSL Agosto", name: "VSL Agosto", value: 2 },
    ]);
  });
});
