import { describe, expect, it } from "vitest";

import {
  buildProfitabilityAnalysis,
  hasOverlappingSpendPeriod,
} from "./analysis";

const day = (value: string) => new Date(`${value}T12:00:00.000Z`);

describe("buildProfitabilityAnalysis", () => {
  it("apportions integer cents deterministically and reconciles every breakdown", () => {
    const result = buildProfitabilityAnalysis({
      from: day("2026-08-01"),
      to: day("2026-08-31"),
      spendPeriods: [{ id: "spend", source: "Meta", campaign: "C1", periodStart: day("2026-08-01"), periodEnd: day("2026-08-31"), spendCents: 100, referenceSaleValueCents: 100, currency: "EUR" }],
      leads: Array.from({ length: 7 }, (_, index) => ({ id: `lead-${index}`, profile: null, source: "Meta", campaign: "C1", ad: `Ad ${index}`, creative: "Creative", acquisitionAngle: "Angle", createdAt: day("2026-08-10"), callerId: null, callerName: null, closerId: null, closerName: null, contacted: false, appointment: false, show: false, sale: false })),
    });

    expect(result.ads.reduce((total, row) => total + row.spendCents, 0)).toBe(100);
    expect(result.ads.find((row) => row.name === "Ad 0")?.spendCents).toBe(15);
    expect(result.ads.find((row) => row.name === "Ad 1")?.spendCents).toBe(15);
    expect(result.ads.find((row) => row.name === "Ad 2")?.spendCents).toBe(14);
    expect(result.creatives.reduce((total, row) => total + row.spendCents, 0)).toBe(100);
    expect(result.acquisitionAngles.reduce((total, row) => total + row.spendCents, 0)).toBe(100);
  });

  it("keeps missing buckets, slug-like real values, and homonymous ads distinct by context", () => {
    const periods = ["C1", "C2"].map((campaign) => ({ id: campaign, source: "Meta", campaign, periodStart: day("2026-08-01"), periodEnd: day("2026-08-31"), spendCents: 100, referenceSaleValueCents: 100, currency: "EUR" }));
    const lead = (id: string, campaign: string, ad: string | null) => ({ id, profile: null, source: "Meta", campaign, ad, creative: null, acquisitionAngle: null, createdAt: day("2026-08-10"), callerId: null, callerName: null, closerId: null, closerName: null, contacted: false, appointment: false, show: false, sale: false });
    const result = buildProfitabilityAnalysis({ from: day("2026-08-01"), to: day("2026-08-31"), spendPeriods: periods, leads: [lead("1", "C1", null), lead("2", "C1", "sin-anuncio"), lead("3", "C1", "Vídeo"), lead("4", "C2", "Vídeo")] });

    expect(result.ads).toHaveLength(4);
    expect(result.ads.filter((row) => row.name === "Vídeo").map((row) => row.context).sort()).toEqual(["Meta · C1", "Meta · C2"]);
    expect(result.ads.find((row) => row.name === "Sin anuncio")?.id).not.toBe(result.ads.find((row) => row.name === "sin-anuncio")?.id);
  });

  it("keeps a legitimate sin-perfil value distinct from the missing profile bucket", () => {
    const base = { source: "Meta", campaign: "C1", ad: null, creative: null, acquisitionAngle: null, createdAt: day("2026-08-10"), callerId: null, callerName: null, closerId: null, closerName: null, contacted: false, appointment: false, show: false, sale: false };
    const result = buildProfitabilityAnalysis({
      from: day("2026-08-01"),
      to: day("2026-08-31"),
      spendPeriods: [{ id: "spend", source: "Meta", campaign: "C1", periodStart: day("2026-08-01"), periodEnd: day("2026-08-31"), spendCents: 100, referenceSaleValueCents: 100, currency: "EUR" }],
      leads: [{ ...base, id: "missing", profile: null }, { ...base, id: "real", profile: "sin-perfil" }],
    });

    expect(result.profiles).toHaveLength(2);
    expect(result.profiles.find((row) => row.name === "Sin perfil")?.id).not.toBe(result.profiles.find((row) => row.name === "sin-perfil")?.id);
  });

  it("attributes spend and estimated revenue to campaign, profile, caller, and closer", () => {
    const leads = Array.from({ length: 100 }, (_, index) => ({
      id: `lead-${index}`,
      profile: index < 50 ? "Emprendedor" : "Ingreso extra",
      source: "Meta",
      campaign: "Agosto",
      ad: index < 70 ? "Video 1" : null,
      creative: index < 60 ? "UGC" : "Estático",
      acquisitionAngle: index < 80 ? "Libertad" : null,
      createdAt: day("2026-08-10"),
      callerId: index < 60 ? "caller-a" : "caller-b",
      callerName: index < 60 ? "Ana" : "Bruno",
      closerId: index < 70 ? "closer-a" : "closer-b",
      closerName: index < 70 ? "Carla" : "Diego",
      contacted: index < 80,
      appointment: index < 40,
      show: index < 20,
      sale: index < 10,
    }));

    const result = buildProfitabilityAnalysis({
      from: day("2026-08-01"),
      to: day("2026-08-31"),
      spendPeriods: [{
        id: "spend-1",
        source: "Meta",
        campaign: "Agosto",
        periodStart: day("2026-08-01"),
        periodEnd: day("2026-08-31"),
        spendCents: 100_000,
        referenceSaleValueCents: 200_000,
        currency: "EUR",
      }],
      leads,
    });

    expect(result.summary).toMatchObject({
      spendCents: 100_000,
      estimatedRevenueCents: 2_000_000,
      estimatedContributionCents: 1_900_000,
      leads: 100,
      sales: 10,
      costPerLeadCents: 1_000,
      customerAcquisitionCostCents: 10_000,
      roas: 20,
    });
    expect(result.campaigns[0]).toMatchObject({
      source: "Meta",
      campaign: "Agosto",
      contacted: 80,
      appointments: 40,
      shows: 20,
      sales: 10,
      suggestion: { action: "increase", suggestedBudgetChangePercent: 15 },
    });
    expect(result.profiles.find((row) => row.name === "Emprendedor")).toMatchObject({
      spendCents: 50_000,
      estimatedRevenueCents: 2_000_000,
      sales: 10,
    });
    expect(result.callers.find((row) => row.id === "caller-a")).toMatchObject({
      name: "Ana",
      spendCents: 60_000,
      sales: 10,
    });
    expect(result.closers.find((row) => row.id === "closer-a")).toMatchObject({
      name: "Carla",
      spendCents: 70_000,
      sales: 10,
    });
    expect(result.ads.find((row) => row.name === "Video 1")).toMatchObject({
      leads: 70,
      spendCents: 70_000,
      sampleLabel: "Muestra suficiente",
      confidence: "high",
    });
    expect(result.ads.find((row) => row.name === "Sin anuncio")).toMatchObject({
      leads: 30,
    });
    expect(result.creatives.find((row) => row.name === "UGC")).toMatchObject({
      contacted: 60,
      appointments: 40,
    });
    expect(result.acquisitionAngles.find((row) => row.name === "Sin ángulo de captación")).toMatchObject({
      leads: 20,
      confidence: "low",
    });
    expect(result.attributionModel).toBe("current_single_touch");
    expect(result.methodology).toMatch(/atribuci[oó]n actual/i);
    expect(result.simulationOnly).toBe(true);
  });

  it("does not invent CAC and asks for more data when the sample is small", () => {
    const result = buildProfitabilityAnalysis({
      from: day("2026-08-01"),
      to: day("2026-08-31"),
      spendPeriods: [{
        id: "spend-1",
        source: "Google",
        campaign: "Search",
        ad: null,
        creative: null,
        acquisitionAngle: null,
        periodStart: day("2026-08-01"),
        periodEnd: day("2026-08-31"),
        spendCents: 30_000,
        referenceSaleValueCents: 150_000,
        currency: "EUR",
      }],
      leads: Array.from({ length: 10 }, (_, index) => ({
        id: `lead-${index}`,
        profile: null,
        source: "Google",
        campaign: "Search",
        createdAt: day("2026-08-10"),
        callerId: null,
        callerName: null,
        closerId: null,
        closerName: null,
        contacted: false,
        appointment: false,
        show: false,
        sale: false,
      })),
    });

    expect(result.summary.customerAcquisitionCostCents).toBeNull();
    expect(result.campaigns[0]?.suggestion).toMatchObject({
      action: "wait",
      suggestedBudgetChangePercent: 0,
    });
  });

  it("refuses to aggregate spend periods from different currencies", () => {
    const base = {
      source: "Meta",
      campaign: "Agosto",
      periodStart: day("2026-08-01"),
      periodEnd: day("2026-08-31"),
      spendCents: 100_000,
      referenceSaleValueCents: 200_000,
    };
    expect(() => buildProfitabilityAnalysis({
      from: day("2026-08-01"),
      to: day("2026-08-31"),
      spendPeriods: [
        { ...base, id: "eur", currency: "EUR" },
        { ...base, id: "usd", currency: "USD" },
      ],
      leads: [],
    })).toThrow(/currency/i);
  });
});

describe("hasOverlappingSpendPeriod", () => {
  it("detects overlap only within the same source and campaign", () => {
    const existing = [{
      id: "existing",
      source: "Meta",
      campaign: "Agosto",
      periodStart: day("2026-08-01"),
      periodEnd: day("2026-08-31"),
    }];

    expect(hasOverlappingSpendPeriod({ existing, source: "Meta", campaign: "Agosto", periodStart: day("2026-08-20"), periodEnd: day("2026-09-10") })).toBe(true);
    expect(hasOverlappingSpendPeriod({ existing, source: "Google", campaign: "Agosto", periodStart: day("2026-08-20"), periodEnd: day("2026-09-10") })).toBe(false);
    expect(hasOverlappingSpendPeriod({ existing, source: "Meta", campaign: "Agosto", periodStart: day("2026-09-01"), periodEnd: day("2026-09-30") })).toBe(false);
  });
});
