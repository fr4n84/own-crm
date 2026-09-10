import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ForwardedRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const MockLink = React.forwardRef(function MockLink(
    { href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
    ref: ForwardedRef<HTMLAnchorElement>,
  ) {
    return <a ref={ref} href={href} {...props} />;
  });
  return { default: MockLink };
});

vi.mock("@/features/leads/assign-lead-drawer", () => ({
  default: ({ triggerLabel }: { triggerLabel: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));

import { NextBestActionView } from "./next-best-action-view";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it("keeps direct actions as semantic links without Base UI button warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onOpen = vi.fn();

    render(
      <NextBestActionView
        mode="closer"
        actions={[
          {
            position: 1,
            lead,
            actionType: "payment_overdue",
            score: 140,
            urgency: "critical",
            reasons: ["Cobro vencido"],
            scheduledAt: null,
            attemptCount: null,
            minutesSinceAssignment: null,
            minutesSinceLastAttempt: null,
          },
          {
            position: 2,
            lead: { ...lead, id: "lead-2", name: "Lead con WhatsApp" },
            actionType: "whatsapp_pending",
            score: 100,
            urgency: "high",
            reasons: ["WhatsApp pendiente"],
            scheduledAt: null,
            attemptCount: null,
            minutesSinceAssignment: null,
            minutesSinceLastAttempt: null,
          },
        ]}
        onOpen={onOpen}
      />
    );

    const salesLink = screen.getByRole("link", { name: "Abrir Ventas" });
    const whatsappLink = screen.getByRole("link", { name: "Abrir WhatsApp" });
    expect(salesLink).toHaveAttribute("href", "/ventas-closer");
    expect(whatsappLink).toHaveAttribute("href", "/whatsapp");
    expect(salesLink).not.toHaveAttribute("role", "button");
    expect(whatsappLink).not.toHaveAttribute("role", "button");
    for (const link of [salesLink, whatsappLink]) {
      link.addEventListener("click", (event) => event.preventDefault());
    }
    fireEvent.click(salesLink);
    fireEvent.click(whatsappLink);
    expect(onOpen).toHaveBeenNthCalledWith(1, expect.objectContaining({ actionType: "payment_overdue" }));
    expect(onOpen).toHaveBeenNthCalledWith(2, expect.objectContaining({ actionType: "whatsapp_pending" }));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows an empty state when there is no pending work", () => {
    render(<NextBestActionView actions={[]} />);

    expect(screen.getByText("No hay acciones pendientes")).toBeInTheDocument();
  });
});
