import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import ProfitabilityPage from "./page";

afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  invalidateQueries: vi.fn(),
}));

vi.mock("@/utils/trpc", () => ({ trpc: { profitability: {
  overview: { queryOptions: () => ({ queryKey: ["profitability"], key: "profitability" }), queryKey: () => ["profitability"] },
  attributionLeads: { queryOptions: () => ({ queryKey: ["attribution-leads"], key: "attributionLeads" }), queryKey: () => ["attribution-leads"] },
  listFinancialLedger: { queryOptions: () => ({ queryKey: ["financial-ledger"], key: "financialLedger" }), queryFilter: () => ({ queryKey: ["financial-ledger"] }) },
  recordFinancialEvent: { mutationOptions: () => ({}) },
  reverseFinancialEvent: { mutationOptions: () => ({}) },
  saveSpend: { mutationOptions: () => ({}) },
  deleteSpend: { mutationOptions: () => ({}) },
}, leads: { updateAcquisitionAttribution: { mutationOptions: () => ({}) } } } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery, useMutation: mocks.useMutation, useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const metrics = { spendCents: 100_000, estimatedRevenueCents: 400_000, estimatedContributionCents: 300_000, leads: 40, contacted: 30, appointments: 15, shows: 8, sales: 2, costPerLeadCents: 2_500, customerAcquisitionCostCents: 50_000, roas: 4, leadToSaleRate: 0.05 };

describe("ProfitabilityPage", () => {
  it("renders suggestion-only financial analysis in five sections", () => {
    const overview = { data: {
      summary: metrics,
      currency: "USD",
      availableCurrencies: ["EUR", "USD"],
      campaigns: [{ source: "Meta", campaign: "Agosto", ...metrics, suggestion: { action: "increase", suggestedBudgetChangePercent: 15, reasons: ["ROAS suficiente"] } }],
      profiles: [{ id: "p", name: "Emprendedor", ...metrics }],
      callers: [{ id: "c", name: "Ana", ...metrics }],
      closers: [],
      ads: [{ id: "ad", name: "Vídeo 1", ...metrics, confidence: "high", sampleLabel: "Muestra suficiente" }],
      creatives: [{ id: "creative", name: "UGC", ...metrics, confidence: "high", sampleLabel: "Muestra suficiente" }],
      acquisitionAngles: [{ id: "angle", name: "Libertad", ...metrics, confidence: "high", sampleLabel: "Muestra suficiente" }],
      spendPeriods: [],
      campaignOptions: [{ source: "Meta", campaign: "Agosto" }],
      simulationOnly: true,
      methodology: "Atribución por cohorte",
    }, isPending: false, isError: false };
    mocks.useQuery.mockImplementation((options: { key: string }) => options.key === "attributionLeads" ? { data: [], isPending: false, isError: false } : overview);

    render(<ProfitabilityPage />);

    expect(screen.getByText("Rentabilidad y atribución")).toBeInTheDocument();
    expect(screen.getByText("Modo sugerencia")).toBeInTheDocument();
    const currencySelect = screen.getByRole("combobox", { name: "Moneda del análisis" });
    expect(currencySelect).toHaveTextContent("USD");
    expect(currencySelect.tagName).toBe("BUTTON");
    expect(screen.getAllByText(/US\$/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    for (const tab of ["Resumen", "Verdad económica", "Campañas", "Anuncios, creatividades y ángulos", "Equipo", "Perfiles", "Gastos"]) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Campañas" }));
    expect(screen.getByText("Aumentar 15%")).toBeInTheDocument();
    expect(screen.getByText("ROAS suficiente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Anuncios, creatividades y ángulos" }));
    expect(screen.getByText("Atribución CURRENT single-touch", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Vídeo 1")).toBeInTheDocument();
    expect(screen.getByText("Sin coincidencias")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Verdad económica" }));
    expect(screen.getAllByText("Verdad económica").length).toBeGreaterThan(1);
  });
});
