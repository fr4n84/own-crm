"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@crm-fran/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@crm-fran/ui/components/dialog";
import { Textarea } from "@crm-fran/ui/components/textarea";

export function SaleVoidDialog({
  leadName,
  pending = false,
  onConfirm,
}: {
  leadName: string;
  pending?: boolean;
  onConfirm: (input: { reason: string; operationId: string }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const isBusy = pending || submitting;

  function handleOpenChange(nextOpen: boolean) {
    if (isBusy) return;
    if (nextOpen && !open) {
      setReason("");
      setOperationId(crypto.randomUUID());
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason || isBusy) return;

    setSubmitting(true);
    try {
      await onConfirm({ reason: normalizedReason, operationId });
      setOpen(false);
    } catch {
      // The caller presents the error; keeping the dialog open makes the same
      // idempotency key available for a safe retry.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="destructive" size="sm" />}>
        Anular venta
      </DialogTrigger>
      <DialogContent
        role="alertdialog"
        aria-busy={isBusy}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Anular venta de {leadName}</DialogTitle>
          <DialogDescription>
            Se conservarán la venta, el contrato, las conciliaciones y la auditoría.
            Los hechos financieros activos se revertirán y las cuotas pendientes se
            cerrarán como historial.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1" htmlFor="sale-void-reason">
            <span className="font-medium">Motivo de la anulación</span>
            <Textarea
              id="sale-void-reason"
              maxLength={1_000}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <DialogClose
              disabled={isBusy}
              render={<Button type="button" variant="outline" />}
            >
              Cancelar
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={isBusy || reason.trim().length === 0}
            >
              {isBusy ? "Anulando…" : "Confirmar anulación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
