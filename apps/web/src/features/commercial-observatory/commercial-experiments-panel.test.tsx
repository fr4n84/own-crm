import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { CommercialExperimentsPanel } from "./commercial-experiments-panel";

afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  invalidateQueries: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/utils/trpc", () => ({ trpc: { commercialExperiments: {
  list: { queryOptions: () => ({ queryKey: ["list"], key: "list" }), queryKey: () => ["list"] },
  detail: { queryOptions: (input: { experimentId: string }) => ({ queryKey: ["detail", input.experimentId], key: "detail" }), queryKey: (input: { experimentId: string }) => ["detail", input.experimentId] },
  create: { mutationOptions: () => ({}) }, activate: { mutationOptions: () => ({}) }, enrollNew: { mutationOptions: () => ({}) }, stop: { mutationOptions: () => ({}) }, complete: { mutationOptions: () => ({}) }, recordFinalDecision: { mutationOptions: () => ({}) }, markTreatmentApplied: { mutationOptions: () => ({}) },
} } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery, useMutation: mocks.useMutation, useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const results = { arms: { control: { sampleSize: 1 }, treatment: { sampleSize: 1 } }, primary: { absolutePpUplift: 0, relativeUplift: null, confidenceInterval95: { lowerPp: null, upperPp: null } }, guardrail: { isHarm: true }, compliance: { rate: 0 }, state: "insufficient", maturedAssignments: 1 };

function mockExperiment(status: "active" | "stopped") {
  mocks.useQuery.mockImplementation((input: { key: string }) => input.key === "list"
    ? { data: [{ id: "exp", name: "Prueba", hypothesis: "H", status, interventionType: "assignment_routing", primaryMetric: "sale" }], isPending: false, isError: false }
    : { data: { results, assignments: [
      { id: "control", leadId: "lead-control", arm: "control", isMature: true, frozenContext: { profile: "A", source: "Meta" }, treatmentAppliedAt: null },
      { id: "treatment", leadId: "lead-treatment", arm: "treatment", isMature: false, frozenContext: { profile: "A", source: "Meta" }, treatmentAppliedAt: null, treatmentInstructions: { instrucciones: "Prioridad manual" } },
    ], treatmentConfig: {} }, isPending: false, isError: false });
}

describe("CommercialExperimentsPanel", () => {
  it("shows the selected intervention label instead of its internal id", () => {
    mocks.useQuery.mockReturnValue({ data: [], isPending: false, isError: false });

    render(<CommercialExperimentsPanel />);

    expect(screen.getByText("Enrutamiento de asignación")).toBeInTheDocument();
    expect(screen.queryByText("assignment_routing")).not.toBeInTheDocument();
  });

  it("keeps metrics and optional fields visible in a compact responsive split", () => {
    mocks.useQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    render(<CommercialExperimentsPanel />);

    const profiles = screen.getByLabelText(/Perfiles elegibles/i);
    const metrics = screen.getByRole("region", { name: "Métricas" });
    const optional = screen.getByRole("region", { name: "Opcional" });

    expect(metrics.parentElement).toBe(optional.parentElement);
    expect(metrics.parentElement).toHaveClass("md:grid-cols-2");
    expect(within(metrics).getByLabelText("Métrica principal")).toBeInTheDocument();
    fireEvent.change(profiles, { target: { value: "Perfil premium" } });

    expect(screen.getByLabelText(/Perfiles elegibles/i)).toHaveValue("Perfil premium");
  });

  it("explains the real tolerance guardrail through an accessible information target", () => {
    mocks.useQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    render(<CommercialExperimentsPanel />);

    const information = screen.getByRole("button", { name: "Información sobre la tolerancia" });
    expect(information).toHaveClass("size-11");
    fireEvent.click(information);

    expect(screen.getByText(/no cambia qué leads se asignan a cada brazo/i)).toBeInTheDocument();
    expect(screen.getByText(/umbral de posible daño/i)).toBeInTheDocument();
  });

  it("renders the three empty cohort tabs", () => {
    mocks.useQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    render(<CommercialExperimentsPanel />);
    expect(screen.getByText("Borradores")).toBeInTheDocument();
    expect(screen.getByText("Activos")).toBeInTheDocument();
    expect(screen.getByText("Resultados")).toBeInTheDocument();
    expect(screen.getByText("Sin borradores")).toBeInTheDocument();
  });

  it("keeps control secret, shows treatment instructions, and renders per-row maturity", () => {
    mockExperiment("active");
    render(<CommercialExperimentsPanel />);
    fireEvent.click(screen.getAllByRole("tab", { name: "Activos" }).at(-1)!);
    expect(screen.getByText("Control: sin instrucciones")).toBeInTheDocument();
    expect(screen.getByText("Prioridad manual")).toBeInTheDocument();
    expect(screen.getByText("Guardrail: posible daño")).toBeInTheDocument();
    expect(screen.getByText("Maduro")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar aplicada" })).toBeInTheDocument();

    const assignments = screen.getByRole("region", { name: "Asignaciones" });
    expect(assignments).toHaveClass("max-h-64", "overflow-auto");
    expect(within(assignments).getByText("lead-control").closest("tr")).toHaveClass("h-9");
  });

  it("hides treatment application once an experiment is stopped", () => {
    mockExperiment("stopped");
    render(<CommercialExperimentsPanel />);
    fireEvent.click(screen.getAllByRole("tab", { name: "Activos" }).at(-1)!);
    expect(screen.queryByRole("button", { name: "Marcar aplicada" })).not.toBeInTheDocument();
    expect(screen.getByText("Tratamiento cerrado")).toBeInTheDocument();
  });
});
