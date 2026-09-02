import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { LearningPlaybooksPanel } from "./learning-playbooks-panel";

const mocks = vi.hoisted(() => ({
  permissionState: {
    permissions: ["leads:read"],
    isLoaded: true,
    isLoading: false,
    error: null,
  },
  useQuery: vi.fn(),
}));

vi.mock("@crm-fran/ui/permissions", () => ({
  usePermissionState: () => mocks.permissionState,
}));

vi.mock("@/utils/trpc", () => {
  const mutation = { mutationOptions: () => ({}) };
  return {
    trpc: {
      commercialPlaybooks: {
        overview: {
          queryOptions: () => ({ kind: "overview" }),
          queryFilter: () => ({ queryKey: ["commercial-playbooks"] }),
        },
        generate: mutation,
        edit: mutation,
        approve: mutation,
        reject: mutation,
        rollback: mutation,
      },
    },
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  mocks.useQuery.mockReset();
  mocks.permissionState = {
    permissions: ["leads:read"],
    isLoaded: true,
    isLoading: false,
    error: null,
  };
});

describe("LearningPlaybooksPanel permissions", () => {
  it("keeps the internal panel restricted to global administrators", () => {
    mocks.useQuery.mockReturnValue({ isPending: false, isError: false });
    render(<LearningPlaybooksPanel />);

    expect(screen.getByText("Acceso restringido")).toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("renders the complete human workflow for administrators", () => {
    mocks.permissionState = {
      permissions: ["*"],
      isLoaded: true,
      isLoading: false,
      error: null,
    };
    mocks.useQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        policyVersion: "commercial-playbooks-v1",
        asOf: "2026-08-27T00:00:00.000Z",
        counts: { readySignals: 0, insufficientSignals: 0 },
        candidates: [],
        proposals: [],
        currentLibraries: [],
        libraryHistory: [],
        proposalHistory: [],
        limitations: [],
      },
    });
    render(<LearningPlaybooksPanel />);

    expect(screen.getByText("Playbooks que aprenden")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Señales detectadas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Propuestas editables" })).toBeInTheDocument();
  });
});
