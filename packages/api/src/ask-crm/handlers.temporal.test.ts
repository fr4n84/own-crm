import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseAskCrmQuestion } from "./domain";
import { ASK_CRM_HANDLERS } from "./handlers";

const mocks = vi.hoisted(() => ({
  getPlanning: vi.fn(),
  listProposals: vi.fn(),
  listLibraries: vi.fn(),
  profitabilityOverview: vi.fn(),
  getMicrosegments: vi.fn(),
  getFeedback: vi.fn(),
}));

vi.mock("../commercial-planning/service", () => ({ getCommercialPlanning: mocks.getPlanning }));
vi.mock("../commercial-playbooks/runtime", () => ({ commercialPlaybooksRepository: {
  listProposalVersions: mocks.listProposals,
  listLibraryVersions: mocks.listLibraries,
} }));
vi.mock("../profitability/service", () => ({ profitabilityService: { overview: mocks.profitabilityOverview } }));
vi.mock("../commercial-evidence/service", () => ({
  getMicrosegments: mocks.getMicrosegments,
  getConfidenceCentre: vi.fn(),
}));
vi.mock("../commercial-intelligence/objection-service", () => ({ getObjectionMotivationIntelligence: mocks.getFeedback }));

const now = new Date("2026-08-26T10:00:00.000Z");

function ready(question: string, overrides?: { currency?: string; fromDay?: string; toDay?: string }) {
  const parsed = parseAskCrmQuestion({ question, overrides, now });
  if (parsed.status !== "ready") throw new Error("Expected a ready question");
  return parsed;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPlanning.mockResolvedValue({
    snapshot: { day: "2026-08-25", from: new Date("2026-08-24T22:00:00.000Z"), to: new Date("2026-08-25T22:00:00.000Z") },
    generatedAt: new Date("2026-08-25T22:00:00.000Z"),
    coverage: { observations: 40, duplicateObservationsExcluded: 2 },
    baseline: { coverage: { conversionMature: 35, economicMature: 30, minimumConversionSample: 30 }, forecast: [{ days: 60, leads: 80, sales: 12, marginBeforeUnmodeledCostsCents: 500_000 }] },
    notice: "Baseline observada.",
  });
  mocks.listProposals.mockResolvedValue([{ lineageKey: "proposal-1", version: 1, status: "approved", createdAt: new Date("2026-08-20T10:00:00.000Z") }]);
  mocks.listLibraries.mockResolvedValue([
    { type: "playbook", status: "published", createdAt: new Date("2026-08-21T10:00:00.000Z") },
    { type: "playbook", status: "published", createdAt: new Date("2099-01-01T00:00:00.000Z") },
  ]);
  mocks.profitabilityOverview.mockResolvedValue({
    campaigns: [
      { source: "Meta", campaign: "Campaña X", estimatedContributionCents: 100, sales: 1, leads: 10 },
      { source: "Meta", campaign: "cliente@example.com", estimatedContributionCents: 50, sales: 1, leads: 5 },
    ],
    profiles: [], ads: [], acquisitionAngles: [], creatives: [],
    summary: { leads: 15, sales: 2 }, methodology: "Atribución descriptiva.",
  });
  mocks.getMicrosegments.mockResolvedValue([{ segment: [["profile", "Latino"], ["motivation", "cliente@example.com"]], conversionBps: 1200, sample: 40 }]);
  mocks.getFeedback.mockResolvedValue({ objections: [], motivations: [] });
});

describe("Pregúntale al CRM handler truthfulness", () => {
  it("projects the planning report's actual baseline window and snapshot", async () => {
    const result = await ASK_CRM_HANDLERS.forecast(ready("Dame el forecast 60"));
    expect(result.temporalScope).toMatchObject({
      kind: "fixed_baseline",
      to: "2026-08-25T22:00:00.000Z",
      snapshot: "2026-08-25",
      snapshotFrom: "2026-08-24T22:00:00.000Z",
      snapshotTo: "2026-08-25T22:00:00.000Z",
      generatedAt: "2026-08-25T22:00:00.000Z",
    });
    if (result.temporalScope.kind !== "fixed_baseline") return;
    expect(Date.parse(result.temporalScope.from)).toBeLessThan(Date.parse(result.temporalScope.to));
    expect(result.temporalScope.label).toContain(result.temporalScope.from);
  });

  it("marks playbooks as an unbounded historical query with a real cutoff", async () => {
    const result = await ASK_CRM_HANDLERS.playbooks(ready("Dame el estado de los playbooks"));
    expect(result.temporalScope).toMatchObject({ kind: "all_time", unboundedRange: true });
    if (result.temporalScope.kind !== "all_time") return;
    expect(Number.isFinite(Date.parse(result.temporalScope.asOf))).toBe(true);
    expect(result.temporalScope.generatedAt).toBe(result.temporalScope.asOf);
    expect(result.temporalScope.label).toContain(result.temporalScope.asOf);
    expect(result.excluded).toBe(1);
  });

  it("sanitizes campaign and microsegment components before joining them", async () => {
    const campaigns = await ASK_CRM_HANDLERS.campaign_profitability(ready("Rentabilidad por campaña", { currency: "EUR" }));
    expect(campaigns.rows.map((row) => row.label)).toEqual(["Meta · Campaña X", "Meta · Valor protegido"]);

    const microsegments = await ASK_CRM_HANDLERS.microsegments(ready("Dame microsegmentos", { currency: "EUR" }));
    expect(microsegments.rows[0]?.label).toBe("profile: Latino · motivation: Valor protegido");
  });

  it("does not query profitability for reaction regardless of currency text", async () => {
    const result = await ASK_CRM_HANDLERS.campaign_profitability(ready("Rentabilidad por campaña según reacción en EUR"));
    expect(result.status).toBe("insufficient_evidence");
    expect(mocks.profitabilityOverview).not.toHaveBeenCalled();
  });

  it("passes an exact Madrid [from, to) interval to objection intelligence", async () => {
    await ASK_CRM_HANDLERS.objections(ready("Cuáles son las objeciones", { fromDay: "2026-03-29", toDay: "2026-03-29" }));
    expect(mocks.getFeedback).toHaveBeenCalledWith({
      from: new Date("2026-03-28T23:00:00.000Z"),
      to: new Date("2026-03-29T22:00:00.000Z"),
      actorId: null,
    });
  });
});
