import { describe, expect, it } from "vitest";

import { ASK_CRM_CATALOG, askCrmSafeTaxonomyComponent, joinAskCrmSafeComponents, parseAskCrmQuestion, sanitizeAskCrmLabel } from "./domain";

const now = new Date("2026-08-26T10:00:00.000Z");

describe("Pregúntale al CRM parser", () => {
  it("publishes the closed server-owned catalog", () => {
    expect(ASK_CRM_CATALOG).toHaveLength(18);
    expect(new Set(ASK_CRM_CATALOG.map((item) => item.id)).size).toBe(18);
  });

  it("resolves every official catalog example to its declared intent", () => {
    for (const item of ASK_CRM_CATALOG) {
      expect(parseAskCrmQuestion({ question: item.example, now })).toMatchObject({ status: "ready", questionId: item.id });
    }
  });

  it("normalizes accents and resolves a bounded closed period", () => {
    const result = parseAskCrmQuestion({ question: "¿Qué anomalías hubo este mes?", now });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.questionId).toBe("anomalies");
    expect(result.period.days).toBe(30);
    expect(result.period.timeZone).toBe("Europe/Madrid");
    expect(result.period.toDay).toBe("2026-08-25");
  });

  it("requires an explicit metric for best campaign", () => {
    const result = parseAskCrmQuestion({ question: "Cuál fue la mejor campaña", now });

    expect(result).toMatchObject({
      status: "clarification_required",
      clarification: { key: "metric", options: ["sales", "margin", "reaction"] },
    });
  });

  it("never mixes currencies or guesses pesos", () => {
    expect(parseAskCrmQuestion({ question: "Dame el margen en EUR y USD", now })).toMatchObject({
      status: "clarification_required",
      clarification: { key: "currency" },
    });
    expect(parseAskCrmQuestion({ question: "Dame la rentabilidad en pesos", now })).toMatchObject({
      status: "clarification_required",
      clarification: { key: "currency" },
    });
    expect(parseAskCrmQuestion({ question: "Dame la rentabilidad en pesos", now, overrides: { currency: "MXN" } })).toMatchObject({
      status: "ready",
      questionId: "economic_truth",
      currency: "MXN",
    });
    expect(parseAskCrmQuestion({ question: "Dame el margen en eur", now })).toMatchObject({ status: "ready", currency: "EUR" });
    expect(parseAskCrmQuestion({ question: "Dame el margen en XYZ", now })).toMatchObject({ status: "clarification_required", clarification: { key: "currency" } });
    expect(parseAskCrmQuestion({ question: "Dame el margen en xyz", now })).toMatchObject({ status: "clarification_required", clarification: { key: "currency" } });
    expect(parseAskCrmQuestion({ question: "Dame las anomalías en los últimos 30 días", now })).toMatchObject({ status: "ready", questionId: "anomalies" });
    expect(parseAskCrmQuestion({ question: "Dame el margen", now, overrides: { currency: "XYZ" } })).toMatchObject({ status: "clarification_required", clarification: { key: "currency" } });
  });

  it.each([7, 30, 60, 90, 180, 365])("supports an explicit %i-day period independently from forecast horizons", (days) => {
    const result = parseAskCrmQuestion({ question: `Qué anomalías hubo en los últimos ${days} días`, now });
    expect(result).toMatchObject({ status: "ready", questionId: "anomalies", period: { days }, horizon: null });
    const compactAlias = parseAskCrmQuestion({ question: `Qué anomalías hubo en los últimos ${days}`, now });
    expect(compactAlias).toMatchObject({ status: "ready", questionId: "anomalies", period: { days }, horizon: null });
  });

  it("does not treat a forecast horizon as the reporting period and reports clamped real days", () => {
    const forecast = parseAskCrmQuestion({ question: "Dame el forecast 60", now });
    expect(forecast).toMatchObject({ status: "ready", questionId: "forecast", horizon: 60, period: { days: 30 } });
    const forecastPeriod = parseAskCrmQuestion({ question: "Dame el forecast de los últimos 60 días", now });
    expect(forecastPeriod).toMatchObject({ status: "ready", questionId: "forecast", horizon: null, period: { days: 60 } });
    const clamped = parseAskCrmQuestion({ question: "Dame las anomalías", now, overrides: { fromDay: "2026-08-24", toDay: "2026-08-26" } });
    expect(clamped).toMatchObject({ status: "ready", period: { fromDay: "2026-08-24", toDay: "2026-08-25", days: 2 } });
  });

  it("keeps Madrid day counts stable across DST", () => {
    const spring = parseAskCrmQuestion({ question: "Dame las anomalías", now: new Date("2026-03-31T12:00:00Z"), overrides: { fromDay: "2026-03-28", toDay: "2026-03-30" } });
    expect(spring).toMatchObject({ status: "ready", period: { days: 3 } });
  });

  it("protects suspicious dimension labels while preserving short taxonomy labels", () => {
    expect(sanitizeAskCrmLabel("Autónomo / emprendedor")).toBe("Autónomo / emprendedor");
    expect(sanitizeAskCrmLabel("cliente@example.com")).toBe("Valor protegido");
    expect(sanitizeAskCrmLabel("+34 612 345 678")).toBe("Valor protegido");
    expect(sanitizeAskCrmLabel("https://example.com/a")).toBe("Valor protegido");
    expect(sanitizeAskCrmLabel("José\u200B")).toBe("José");
    expect(sanitizeAskCrmLabel("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe("Valor protegido");
    expect(sanitizeAskCrmLabel("Este cliente ha contado demasiados detalles personales en llamada")).toBe("Valor protegido");
    expect(joinAskCrmSafeComponents(["Meta", "Campaña X"])).toBe("Meta · Campaña X");
    expect(joinAskCrmSafeComponents(["Meta", "cliente@example.com"])).toBe("Meta · Valor protegido");
    expect(joinAskCrmSafeComponents([askCrmSafeTaxonomyComponent("profile", "Latino"), askCrmSafeTaxonomyComponent("motivation", "cliente@example.com")])).toBe("profile: Latino · motivation: Valor protegido");
    expect(sanitizeAskCrmLabel("Meta\u200B · Campaña X")).toBe("Meta · Campaña X");
  });

  it("short-circuits reaction questions before irrelevant currency clarification", () => {
    const withoutCurrency = parseAskCrmQuestion({ question: "Rentabilidad por campaña según reacción", now });
    const withAmbiguousCurrency = parseAskCrmQuestion({ question: "Rentabilidad por campaña según reacción en pesos", now });
    expect(withoutCurrency).toMatchObject({ status: "ready", questionId: "campaign_profitability", metric: "reaction", currency: null });
    expect(withAmbiguousCurrency).toMatchObject({ status: "ready", questionId: "campaign_profitability", metric: "reaction", currency: null });
  });

  it("rejects future and oversized ranges", () => {
    expect(() => parseAskCrmQuestion({ question: "Dame las anomalías", now, overrides: { fromDay: "2026-08-01", toDay: "2026-08-27" } })).toThrow(/future/i);
    expect(() => parseAskCrmQuestion({ question: "Dame las anomalías", now, overrides: { fromDay: "2025-01-01", toDay: "2026-08-25" } })).toThrow(/366/);
  });
});
