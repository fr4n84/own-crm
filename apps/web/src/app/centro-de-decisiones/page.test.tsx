import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import DecisionCenterPage from "./page";

afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  mutate: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@/utils/trpc", () => ({ trpc: { decisionCenter: {
  weekly: { queryOptions: () => ({ queryKey: ["decision-center"], key: "weekly" }), queryKey: () => ["decision-center"] },
  transition: { mutationOptions: () => ({}) },
} } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(() => ({ mutate: mocks.mutate, isPending: false })),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

describe("DecisionCenterPage", () => {
  it("shows frozen evidence, estimated labels and allowed lifecycle actions", () => {
    mocks.useQuery.mockReturnValue({ data: {
      weekStart: "2026-08-24T00:00:00.000Z",
      maximumDecisions: 5,
      suggestionOnly: true,
      decisions: [{
        id: "d1", weekStart: "2026-08-24T00:00:00.000Z", sourceType: "profitability", sourceFingerprint: "fp", title: "Revisar Meta", summary: "ROAS inferior a uno", scope: "campaign:Meta:Agosto", status: "proposed", priority: "critical", rank: 1, evidence: { roas: 0.7, leads: 83 }, estimatedImpactCents: 140000, impactIsEstimated: true, confidencePercent: null, sampleSize: 83, assignee: null, dueAt: null, createdAt: "2026-08-24T08:00:00.000Z", events: [],
      }],
    }, isPending: false, isError: false });

    render(<DecisionCenterPage />);

    expect(screen.getByText("Centro de decisiones semanal")).toBeInTheDocument();
    expect(screen.getByText(/Impacto estimado/)).toBeInTheDocument();
    expect(screen.getByText("83 casos")).toBeInTheDocument();
    expect(screen.getByText(/ROAS inferior a uno/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar decisión" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ decisionId: "d1", action: "approve" });
    expect(screen.getByRole("button", { name: "Rechazar decisión" })).toBeInTheDocument();
  });

  it("describes an empty week as a frozen snapshot", () => {
    mocks.useQuery.mockReturnValue({
      data: {
        weekStart: "2026-08-24T00:00:00.000Z",
        maximumDecisions: 5,
        suggestionOnly: true,
        decisions: [],
      },
      isPending: false,
      isError: false,
    });

    render(<DecisionCenterPage />);

    expect(screen.getByText(/No se detectaron decisiones al congelar esta semana/)).toBeInTheDocument();
    expect(screen.queryByText(/volverá a materializar/)).not.toBeInTheDocument();
  });
});
