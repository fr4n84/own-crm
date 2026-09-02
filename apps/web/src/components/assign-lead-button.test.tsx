import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssignLeadButton from "./assign-lead-button";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  mutate: vi.fn((_input: unknown, options?: { onSuccess?: () => void }) => {
    options?.onSuccess?.();
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/lib/use-trpc-mutation-with-toast", () => ({
  useTrpcMutationWithToast: () => ({ mutate: mocks.mutate, isPending: false }),
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    leads: {
      assignLeadToCaller: { mutationOptions: () => ({}) },
      listAll: { queryKey: () => ["list-all"] },
      listWithoutAssigned: { queryKey: () => ["list-without-assigned"] },
      listByUserId: { queryKey: () => ["list-by-user"] },
    },
  },
}));

vi.mock("@/components/loader", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AssignLeadButton", () => {
  it("notifies the queue after a successful assignment", async () => {
    const onSuccess = vi.fn();
    const closeDialog = vi.fn();

    render(
      <AssignLeadButton leadId="lead-1" closeDialog={closeDialog} onSuccess={onSuccess}>
        Confirmar
      </AssignLeadButton>,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(closeDialog).toHaveBeenCalledOnce();
  });
});
