import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AdIntelligenceSection } from "./ad-intelligence-section";

afterEach(cleanup);
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock("@/utils/trpc", () => ({ trpc: {
  profitability: {
    attributionLeads: { queryOptions: (input: unknown) => ({ key: "leads", input }), queryKey: () => ["leads"] },
    overview: { queryKey: () => ["overview"] },
  },
  leads: { updateAcquisitionAttribution: { mutationOptions: () => ({}) } },
} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [{ id: "lead-1", name: "Ana", email: "ana@example.com", source: "Meta", campaign: "C1", ad: "Vídeo", creative: "UGC", acquisitionAngle: "Libertad" }], isPending: false, isError: false }),
  useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("recharts", () => ({ ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Bar: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, Legend: () => null }));

const row = { id: "row", name: "Vídeo", context: "Meta · C1", spendCents: 100, estimatedRevenueCents: 200, estimatedContributionCents: 100, leads: 2, contacted: 2, appointments: 1, shows: 1, sales: 1, costPerLeadCents: 50, customerAcquisitionCostCents: 100, roas: 2, leadToSaleRate: 0.5, confidence: "low" as const, sampleLabel: "Muestra insuficiente" };

describe("AdIntelligenceSection", () => {
  it("shows context and conversion and clears stale selection when search changes", async () => {
    render(<AdIntelligenceSection ads={[row]} creatives={[]} acquisitionAngles={[]} currency="EUR" />);
    expect(screen.getByText("Meta · C1")).toBeInTheDocument();
    expect(screen.getByText(/Conversión 50.0%/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Lead" }));
    fireEvent.click(await screen.findByRole("option", { name: /Ana/ }));
    expect(screen.getByLabelText("Anuncio")).toHaveValue("Vídeo");

    fireEvent.change(screen.getByLabelText("Buscar lead"), { target: { value: "otro" } });
    expect(screen.getByRole("button", { name: "Guardar atribución" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar atribución" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
