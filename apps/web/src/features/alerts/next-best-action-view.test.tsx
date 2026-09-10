import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/leads/assign-lead-drawer", () => ({
  default: ({ triggerLabel }: { triggerLabel: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));

import { NextBestActionView } from "./next-best-action-view";

const lead = {
  id: "lead-1",
  name: "Lead prioritario",
  email: "lead@example.com",
  phone: "600000000",
  type: "maestra" as const,
  state: "new",
  response: "",
  feedback: "",
  questions: [],
  callerId: "caller-1",
  closerId: null,
  caller: { id: "caller-1", name: "Caller", email: "caller@example.com" },
  closer: null,
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

describe("NextBestActionView", () => {
  it("highlights the first action and explains why it has priority", () => {
    render(
      <NextBestActionView
        actions={[
          {
            position: 1,
            lead,
            actionType: "future_call",
            score: 130,
            urgency: "critical",
            reasons: ["Llamada programada vencida"],
            scheduledAt: "2026-08-22T11:00:00.000Z",
            attemptCount: 1,
            minutesSinceAssignment: 180,
            minutesSinceLastAttempt: 60,
          },
        ]}
      />,
    );

    expect(screen.getByText("Lead prioritario")).toBeInTheDocument();
    expect(screen.getByText("Llamada programada vencida")).toBeInTheDocument();
    expect(screen.getByText("Crítica")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar ahora" })).toBeInTheDocument();
  });

  it("uses readable signal labels and routes collection work directly to sales", () => {
    render(
      <NextBestActionView
        mode="closer"
        actions={[{
          position: 1,
          lead,
          actionType: "payment_overdue",
          score: 140,
          urgency: "critical",
          reasons: ["Cobro vencido: 50,00 € pendientes"],
          scheduledAt: "2026-08-20T00:00:00.000Z",
          attemptCount: null,
          minutesSinceAssignment: null,
          minutesSinceLastAttempt: null,
        }]}
      />,
    );

    expect(screen.getByText("Gestionar cobro vencido")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir Ventas" })).toHaveAttribute("href", "/ventas-closer");
    expect(screen.queryByText(/Puntuación/)).not.toBeInTheDocument();
  });

  it("shows an empty state when there is no pending work", () => {
    render(<NextBestActionView actions={[]} />);

    expect(screen.getByText("No hay acciones pendientes")).toBeInTheDocument();
  });
});
