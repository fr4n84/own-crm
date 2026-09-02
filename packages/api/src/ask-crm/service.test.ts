import { describe, expect, it, vi } from "vitest";

import type { AskCrmHandlers } from "./handlers";
import { createAskCrmService } from "./service";

const now = new Date("2026-08-26T10:00:00.000Z");

describe("Pregúntale al CRM service", () => {
  it("executes exactly one closed handler and returns an explanatory envelope", async () => {
    const anomalyHandler = vi.fn(async () => ({
      status: "available" as const,
      summary: "Sin anomalías materiales.",
      rows: [{ label: "Volumen", metric: "delta", value: 2, unit: "count" as const, sample: 40, status: "available" as const }], total: 40, matured: 35, excluded: 5,
      minimum: "30 casos", formula: "Mediana y MAD", datasets: ["safe_read_model"],
      limitations: ["Descriptivo, no causal"],
      metricDefinition: "Desviación del volumen frente a su baseline robusto.",
      temporalScope: { kind: "period" as const, label: "Periodo cerrado", fromDay: "2026-07-27", toDay: "2026-08-25" },
    }));
    const forbidden = vi.fn(async () => { throw new Error("must not run"); });
    const handlers: AskCrmHandlers = {
      economic_truth: forbidden, campaign_profitability: forbidden, profile_performance: forbidden,
      creative_performance: forbidden, profile_reactions: forbidden, objections: forbidden,
      motivations: forbidden, microsegments: forbidden, confidence: forbidden, anomalies: anomalyHandler,
      seasonality: forbidden, sales_margin_bridge: forbidden, dependencies: forbidden, forecast: forbidden,
      planning_readiness: forbidden, existing_decisions: forbidden, playbooks: forbidden, ranking: forbidden,
    };
    const service = createAskCrmService(handlers, () => now);

    const result = await service.ask({ question: "Qué anomalías hubo este mes" });

    expect(result).toMatchObject({ status: "answered", questionId: "anomalies", explanation: { definition: "Desviación del volumen frente a su baseline robusto.", temporalScope: { kind: "period" }, timeZone: "Europe/Madrid", noFx: true, total: 40, matured: 35, excluded: 5 } });
    expect(anomalyHandler).toHaveBeenCalledOnce();
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/leadId|email|phone|transcript|evidenceRef/i);
  });

  it("derives status only from the sanitized returned top ten rows", async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({ label: index === 0 ? "person@example.com" : `Grupo ${index}`, metric: "test", value: index, unit: "count" as const, sample: 1, status: index === 10 ? "available" as const : "insufficient_evidence" as const }));
    const anomalyHandler = vi.fn(async () => ({ status: "available" as const, summary: "test", rows, total: 11, matured: 1, excluded: 0, minimum: "test", formula: "test", datasets: ["test"], limitations: ["test"], metricDefinition: "Métrica real", temporalScope: { kind: "period" as const, label: "Periodo", fromDay: "2026-07-27", toDay: "2026-08-25" } }));
    const unavailable = vi.fn(async () => { throw new Error("must not run"); });
    const handlers: AskCrmHandlers = { economic_truth: unavailable, campaign_profitability: unavailable, profile_performance: unavailable, creative_performance: unavailable, profile_reactions: unavailable, objections: unavailable, motivations: unavailable, microsegments: unavailable, confidence: unavailable, anomalies: anomalyHandler, seasonality: unavailable, sales_margin_bridge: unavailable, dependencies: unavailable, forecast: unavailable, planning_readiness: unavailable, existing_decisions: unavailable, playbooks: unavailable, ranking: unavailable };
    const result = await createAskCrmService(handlers, () => now).ask({ question: "Dame las anomalías" });
    expect(result.status).toBe("insufficient_evidence");
    if (result.status !== "insufficient_evidence") return;
    expect(result.rows).toHaveLength(10);
    expect(result.rows[0]?.label).toBe("Valor protegido");
  });

  it("does not call a handler while clarification is required", async () => {
    const handler = vi.fn();
    const handlers: AskCrmHandlers = {
      economic_truth: handler, campaign_profitability: handler, profile_performance: handler,
      creative_performance: handler, profile_reactions: handler, objections: handler,
      motivations: handler, microsegments: handler, confidence: handler, anomalies: handler,
      seasonality: handler, sales_margin_bridge: handler, dependencies: handler, forecast: handler,
      planning_readiness: handler, existing_decisions: handler, playbooks: handler, ranking: handler,
    };
    const service = createAskCrmService(handlers, () => now);

    const result = await service.ask({ question: "Cuál fue la mejor campaña" });

    expect(result.status).toBe("clarification_required");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns the same safe insufficiency for reaction with or without a currency mention", async () => {
    const service = createAskCrmService(undefined, () => now);
    const withoutCurrency = await service.ask({ question: "Rentabilidad por campaña según reacción" });
    const withCurrency = await service.ask({ question: "Rentabilidad por campaña según reacción en EUR" });

    expect(withoutCurrency.status).toBe("insufficient_evidence");
    expect(withCurrency.status).toBe("insufficient_evidence");
    if (withoutCurrency.status !== "insufficient_evidence" || withCurrency.status !== "insufficient_evidence") return;
    expect(withCurrency.explanation).toEqual(withoutCurrency.explanation);
    expect(withCurrency.summary).toBe(withoutCurrency.summary);
    expect(withCurrency.explanation.formula).not.toMatch(/contact/i);
  });
});
