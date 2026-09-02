import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import VslLeadsPage from "./page";

const mocks = vi.hoisted(() => ({
  assignmentQueue: vi.fn(() => null),
  assignedLeads: vi.fn(() => null),
}));

vi.mock("@crm-fran/ui/permissions/can", () => ({
  Can: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/features/leads/lead-assignment-queue", () => ({
  LeadAssignmentQueue: mocks.assignmentQueue,
}));

vi.mock("@/features/leads/assigned-leads-table", () => ({
  AssignedLeadsTable: mocks.assignedLeads,
}));

describe("VslLeadsPage", () => {
  it("shows available VSL leads and assigned VSL leads on the same page", () => {
    const { container } = render(<VslLeadsPage />);

    expect(mocks.assignmentQueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "vsl" }),
      undefined,
    );
    expect(mocks.assignedLeads).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "vsl",
        title: "Leads VSL asignados",
      }),
      undefined,
    );
    const view = container.querySelector('[data-slot="vsl-leads-view"]');
    expect(view).toHaveClass("w-full");
    expect(view).not.toHaveClass("max-w-6xl");
  });
});
