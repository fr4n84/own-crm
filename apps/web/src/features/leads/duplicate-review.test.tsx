import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pages = {
  first: {
    items: [
      {
        id: "case-1",
        reasons: ["exact_email", "exact_phone", "similar_name"],
        nameSimilarity: 100,
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
        leadA: { id: "lead-a", name: "Ana", email: "ana@example.com", phone: "600000001" },
        leadB: { id: "lead-b", name: "Ana duplicada", email: "ana@example.com", phone: "600000001" },
      },
      {
        id: "case-2",
        reasons: ["similar_name"],
        nameSimilarity: 85,
        createdAt: new Date("2026-09-10T10:01:00.000Z"),
        leadA: { id: "lead-c", name: "Bea", email: "bea@example.com", phone: "600000002" },
        leadB: { id: "lead-d", name: "Beatriz", email: "other@example.com", phone: "600000003" },
      },
    ],
    nextCursor: { createdAt: "2026-09-10T10:01:00.000Z", id: "case-2" },
  },
  second: {
    items: [
      {
        id: "case-3",
        reasons: ["exact_phone"],
        nameSimilarity: 20,
        createdAt: new Date("2026-09-10T10:02:00.000Z"),
        leadA: { id: "lead-e", name: "Carla", email: "carla@example.com", phone: "600000004" },
        leadB: { id: "lead-f", name: "Carlos", email: "carlos@example.com", phone: "600000004" },
      },
    ],
    nextCursor: null,
  },
};

const mocks = vi.hoisted(() => ({
  mergeBatch: vi.fn(),
  mergeOne: vi.fn(),
  dismiss: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  queryInputs: [] as unknown[],
}));

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/utils/trpc", () => ({
  trpc: {
    leads: {
      duplicateCases: {
        queryOptions: (input?: { cursor?: { id: string } }) => {
          mocks.queryInputs.push(input);
          const page = input?.cursor ? pages.second : pages.first;
          return { queryKey: ["duplicate-cases", input?.cursor?.id ?? "first"], queryFn: async () => page };
        },
        queryKey: () => ["duplicate-cases"],
      },
      mergeDuplicate: {
        mutationOptions: (options: object) => ({ mutationFn: mocks.mergeOne, ...options }),
      },
      mergeDuplicateBatch: {
        mutationOptions: (options: object) => ({ mutationFn: mocks.mergeBatch, ...options }),
      },
      dismissDuplicate: {
        mutationOptions: (options: object) => ({ mutationFn: mocks.dismiss, ...options }),
      },
    },
  },
}));

import { DuplicateReview } from "./duplicate-review";

function renderReview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}><DuplicateReview /></QueryClientProvider>);
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mergeBatch.mockResolvedValue([
    { caseId: "case-1", status: "merged", canonicalLeadId: "lead-a", aliasLeadId: "lead-b", auditId: "audit-1" },
    { caseId: "case-2", status: "failed", code: "CONFLICT", message: "Ambos leads tienen una venta" },
  ]);
  mocks.dismiss.mockResolvedValue({ id: "case-1" });
});

describe("DuplicateReview", () => {
  it("selects only visible cases, requires a principal for each and exposes partial failures", async () => {
    renderReview();
    expect(await screen.findByText("Ana duplicada")).toBeInTheDocument();
    expect(screen.getByText(/nombre, teléfono y correo coinciden exactamente/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar caso Ana y Ana duplicada" }));
    fireEvent.click(screen.getByRole("button", { name: "Conservar Ana como principal" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar caso Bea y Beatriz" }));
    expect(screen.getByRole("button", { name: "Fusionar seleccionados" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Conservar Beatriz como principal" }));
    fireEvent.click(screen.getByRole("button", { name: "Fusionar seleccionados" }));

    await waitFor(() => expect(mocks.mergeBatch).toHaveBeenCalled());
    expect(mocks.mergeBatch.mock.calls[0]?.[0]).toEqual({
      entries: [
        { caseId: "case-1", canonicalLeadId: "lead-a" },
        { caseId: "case-2", canonicalLeadId: "lead-d" },
      ],
    });
    expect(await screen.findByText("case-2: Ambos leads tienen una venta")).toBeInTheDocument();
    expect(mocks.error).toHaveBeenCalledWith("1 caso no se pudo fusionar");
  });

  it("clears page-scoped selection when navigating with the stable cursor", async () => {
    renderReview();
    expect(await screen.findByText("Ana duplicada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar caso Ana y Ana duplicada" }));
    fireEvent.click(screen.getByRole("button", { name: "Conservar Ana como principal" }));
    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(await screen.findByText("Carla")).toBeInTheDocument();
    expect(screen.getByText("0 seleccionados")).toBeInTheDocument();
    expect(mocks.queryInputs).toContainEqual({
      pageSize: 20,
      cursor: { createdAt: "2026-09-10T10:01:00.000Z", id: "case-2" },
    });
  });
});