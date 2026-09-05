import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

vi.mock("@/features/alerts/use-alerts", () => ({
  useAlerts: () => ({ data: [], isLoading: false, isError: false }),
  useAlertPreferences: () => ({ data: undefined }),
  useDismissAlert: () => ({ mutate: vi.fn() }),
  useLeadRiskQueue: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/features/alerts/lead-risk-queue", () => ({
  LeadRiskQueue: () => <div>Cola de riesgo</div>,
}));

vi.mock("@/features/alerts/alert-preferences-dialog", () => ({
  AlertPreferencesDialog: () => <button type="button">Preferencias</button>,
}));

import { AlertsInbox } from "./page";

afterEach(cleanup);

describe("AlertsInbox", () => {
  it("keeps the existing filters visible when there are no traditional alerts", () => {
    render(<AlertsInbox />);

    expect(screen.getByLabelText("Filtrar alertas por relevancia")).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar alertas por caller")).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar alertas por tipo")).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar alertas por closer")).toBeInTheDocument();
    expect(screen.getByText("No hay alertas pendientes")).toBeInTheDocument();
  });

  it("keeps the selected relevance label in Spanish", async () => {
    const user = userEvent.setup();
    render(<AlertsInbox />);

    const trigger = screen.getByRole("combobox", {
      name: "Filtrar alertas por relevancia",
    });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Alta" }));

    expect(trigger).toHaveTextContent("Alta");
    expect(trigger).not.toHaveTextContent("urgent");
  });
});
