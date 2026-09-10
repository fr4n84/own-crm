import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SaleVoidDialog } from "./sale-void-dialog";

afterEach(cleanup);

describe("SaleVoidDialog", () => {
  it("is mounted behind wildcard Admin authorization without deletion copy", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "./closer-sales-view.tsx"),
      "utf8",
    );

    expect(source).toContain('<Can permission="*"><SaleVoidDialog');
    expect(source).not.toMatch(/>\s*Eliminar\s*</i);
  });

  it("requires a reason and explicitly preserves audit evidence", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(<SaleVoidDialog leadName="Ada Lovelace" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Anular venta de Ada Lovelace",
    });
    expect(dialog).toHaveTextContent(
      "Se conservarán la venta, el contrato, las conciliaciones y la auditoría.",
    );
    expect(dialog).not.toHaveTextContent(/eliminar/i);

    const confirm = screen.getByRole("button", { name: "Confirmar anulación" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Motivo de la anulación"), {
      target: { value: "Contrato duplicado" },
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({
      reason: "Contrato duplicado",
      operationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    }));
  });

  it("retains the same operation id when a failed request is retried", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    render(<SaleVoidDialog leadName="Ada Lovelace" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    fireEvent.change(await screen.findByLabelText("Motivo de la anulación"), {
      target: { value: "Contrato duplicado" },
    });

    const confirm = screen.getByRole("button", { name: "Confirmar anulación" });
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));

    expect(onConfirm.mock.calls[1]?.[0].operationId).toBe(
      onConfirm.mock.calls[0]?.[0].operationId,
    );
  });
});

