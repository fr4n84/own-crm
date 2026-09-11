import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CollectionFollowUpDialog,
  ImpagosReportView,
} from "./impagos-panel";

afterEach(cleanup);

const report = {
  asOf: "2026-09-10",
  metrics: [
    {
      currency: "EUR",
      configuredSalesCount: 2,
      delinquentSalesCount: 1,
      delinquentSalesBps: 5_000,
      overdueCents: 26_000,
      contractedCents: 50_000,
      collectedCents: 24_000,
      overdueVsContractedBps: 5_200,
      overdueVsCollectedBps: 10_833,
    },
    {
      currency: "USD",
      configuredSalesCount: 1,
      delinquentSalesCount: 1,
      delinquentSalesBps: 10_000,
      overdueCents: 10_000,
      contractedCents: 10_000,
      collectedCents: 0,
      overdueVsContractedBps: 10_000,
      overdueVsCollectedBps: null,
    },
  ],
  rows: [
    {
      installmentId: "installment-1",
      lead: { id: "lead-1", name: "Ada Lovelace" },
      currency: "EUR",
      sequence: 1,
      totalInstallments: 2,
      dueOn: "2026-09-08",
      daysOverdue: 2,
      expectedCents: 25_000,
      paidCents: 5_000,
      pendingCents: 20_000,
      closer: { id: "closer-1", name: "Grace Hopper" },
      lastCollectionContact: {
        occurredAt: "2026-09-09T09:00:00.000Z",
        note: "<img src=x onerror=alert(1)>",
      },
      nextAction: { scheduledFor: "2026-09-12", note: "Llamar de nuevo" },
      financialStatus: "overdue_partial" as const,
      operationalStatus: "next_action_scheduled" as const,
    },
  ],
  exclusions: {
    legacyIncompleteSalesCount: 2,
    unconfiguredSalesCount: 1,
    voidedSalesCount: 1,
  },
};

describe("ImpagosReportView", () => {
  it("keeps metrics separated by currency and explains honest denominators", () => {
    render(<ImpagosReportView report={report} onRecord={vi.fn()} />);

    const eur = screen.getByRole("region", { name: "Métricas EUR" });
    expect(within(eur).getByText("50,00 %")).toBeInTheDocument();
    expect(within(eur).getByText("52,00 %")).toBeInTheDocument();
    expect(within(eur).getByText("108,33 %")).toBeInTheDocument();

    const usd = screen.getByRole("region", { name: "Métricas USD" });
    expect(within(usd).getAllByText("100,00 %")).toHaveLength(2);
    expect(within(usd).getByText("No disponible")).toBeInTheDocument();
    expect(screen.getByText(/ventas legacy sin verdad financiera completa se excluyen/i)).toBeInTheDocument();
  });

  it("shows installment-level operational evidence as plain text", () => {
    const { container } = render(
      <ImpagosReportView report={report} onRecord={vi.fn()} />,
    );

    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("2 días")).toBeInTheDocument();
    expect(screen.getByText(/Pendiente\s+200,00\s€/)).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Registrar seguimiento de Ada Lovelace" })).toBeInTheDocument();
  });

  it("has a specific empty state", () => {
    render(<ImpagosReportView report={{ ...report, rows: [] }} onRecord={vi.fn()} />);
    expect(screen.getByText("No hay cuotas vencidas pendientes")).toBeInTheDocument();
  });
});

describe("CollectionFollowUpDialog", () => {
  it("requires bounded fields and retains one operation id across a failed retry", async () => {
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    render(
      <CollectionFollowUpDialog
        installmentId="installment-1"
        leadName="Ada Lovelace"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Registrar seguimiento de Ada Lovelace" }));
    expect(await screen.findByRole("dialog", { name: "Seguimiento de cobro · Ada Lovelace" })).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Guardar seguimiento" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Contacto realizado"), {
      target: { value: "Cliente contactado" },
    });
    fireEvent.change(screen.getByLabelText("Fecha de próxima acción"), {
      target: { value: "2026-09-12" },
    });
    fireEvent.change(screen.getByLabelText("Próxima acción"), {
      target: { value: "Volver a llamar" },
    });

    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));

    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      installmentId: "installment-1",
      contactNote: "Cliente contactado",
      nextActionOn: "2026-09-12",
      nextActionNote: "Volver a llamar",
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    expect(onConfirm.mock.calls[1]?.[0].operationId).toBe(
      onConfirm.mock.calls[0]?.[0].operationId,
    );
  });
});

describe("CloserSalesView tabs contract", () => {
  it("presents accessible Cartera and Impagos tabs and mounts the extracted panel", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "./closer-sales-view.tsx"),
      "utf8",
    );

    expect(source).toContain("<TabsList");
    expect(source).toContain('value="portfolio"');
    expect(source).toContain(">Cartera</TabsTrigger>");
    expect(source).toContain('value="delinquencies"');
    expect(source).toContain(">Impagos</TabsTrigger>");
    expect(source).toContain("<ImpagosPanel />");
  });
});
