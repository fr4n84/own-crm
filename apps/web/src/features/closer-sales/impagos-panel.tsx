"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { CalendarClockIcon, MessageSquareTextIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import type { AppRouter } from "@crm-fran/api/routers/index";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
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
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Textarea } from "@crm-fran/ui/components/textarea";

import { trpc } from "@/utils/trpc";

type DelinquencyReport = inferRouterOutputs<AppRouter>["closerSales"]["delinquencies"];
type CollectionFollowUpInput = inferRouterInputs<AppRouter>["closerSales"]["recordCollectionFollowUp"];
type DelinquencyRow = DelinquencyReport["rows"][number];

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatBps(bps: number | null) {
  return bps === null
    ? "No disponible"
    : new Intl.NumberFormat("es-ES", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(bps / 10_000);
}

function formatDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

function formatOccurredAt(value: Date | string) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function financialStatusLabel(status: DelinquencyRow["financialStatus"]) {
  return status === "overdue_partial" ? "Vencida · cobro parcial" : "Vencida · sin cobro";
}

function operationalStatusLabel(status: DelinquencyRow["operationalStatus"]) {
  switch (status) {
    case "next_action_due": return "Próxima acción vencida";
    case "next_action_scheduled": return "Próxima acción programada";
    case "contact_recorded": return "Contacto registrado";
    case "reviewed": return "Revisada";
    default: return "Sin gestionar";
  }
}

export function ImpagosPanel() {
  const client = useQueryClient();
  const report = useQuery(trpc.closerSales.delinquencies.queryOptions());
  const followUp = useMutation(trpc.closerSales.recordCollectionFollowUp.mutationOptions({
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: trpc.closerSales.delinquencies.queryKey(),
      });
      toast.success("Seguimiento de cobro guardado");
    },
    onError: (error) => toast.error(error.message),
  }));

  if (report.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-label="Cargando impagos">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (report.isError) {
    return (
      <Empty
        heading="No se pudieron cargar los impagos"
        description="Comprueba tu acceso de ventas y vuelve a intentarlo."
      />
    );
  }

  return (
    <ImpagosReportView
      report={report.data}
      onRecord={(input) => followUp.mutateAsync(input)}
    />
  );
}

export function ImpagosReportView({
  report,
  onRecord,
}: {
  report: DelinquencyReport;
  onRecord: (input: CollectionFollowUpInput) => Promise<unknown> | unknown;
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="delinquencies-title">
      <div>
        <h2 id="delinquencies-title" className="text-xl font-semibold">Impagos</h2>
        <p className="text-sm text-muted-foreground">
          Impago significa importe pendiente después de la fecha de vencimiento.
          Las ventas legacy sin verdad financiera completa se excluyen.
        </p>
      </div>

      {report.metrics.length === 0 ? (
        <Card>
          <CardContent>
            <Empty
              heading="No hay ventas configuradas para el informe"
              description="Configura la verdad financiera de la cartera para calcular los porcentajes."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {report.metrics.map((metric) => (
            <Card key={metric.currency} role="region" aria-label={`Métricas ${metric.currency}`}>
              <CardHeader>
                <CardTitle>{metric.currency}</CardTitle>
                <CardDescription>
                  {metric.delinquentSalesCount} de {metric.configuredSalesCount} ventas configuradas tienen alguna cuota impagada.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Metric label="Ventas con impago" value={formatBps(metric.delinquentSalesBps)} />
                <Metric label="Importe vencido" value={formatMoney(metric.overdueCents, metric.currency)} />
                <Metric label="Vencido / contratado" value={formatBps(metric.overdueVsContractedBps)} />
                <Metric label="Vencido / cobrado" value={formatBps(metric.overdueVsCollectedBps)} />
                <Metric label="Contratado" value={formatMoney(metric.contractedCents, metric.currency)} />
                <Metric label="Cobrado efectivo" value={formatMoney(metric.collectedCents, metric.currency)} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Excluidas: {report.exclusions.legacyIncompleteSalesCount} ventas legacy incompletas,
        {" "}{report.exclusions.unconfiguredSalesCount} sin cuotas configuradas y
        {" "}{report.exclusions.voidedSalesCount} anuladas.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Cuotas vencidas pendientes</CardTitle>
          <CardDescription>
            Cada fila representa una cuota concreta. Una venta con varias cuotas aparece una vez por cada vencimiento pendiente.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {report.rows.length === 0 ? (
            <Empty
              heading="No hay cuotas vencidas pendientes"
              description="La cartera configurada no tiene importe pendiente tras su vencimiento."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Cuota</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Días vencidos</TableHead>
                  <TableHead>Importes</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Último contacto</TableHead>
                  <TableHead>Próxima acción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.installmentId}>
                    <TableCell className="font-medium">{row.lead.name}</TableCell>
                    <TableCell>{row.sequence}/{row.totalInstallments}</TableCell>
                    <TableCell>{formatDay(row.dueOn)}</TableCell>
                    <TableCell>{row.daysOverdue} {row.daysOverdue === 1 ? "día" : "días"}</TableCell>
                    <TableCell>
                      <div className="min-w-40 space-y-0.5">
                        <p className="font-medium">Pendiente {formatMoney(row.pendingCents, row.currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          Previsto {formatMoney(row.expectedCents, row.currency)} · Cobrado {formatMoney(row.paidCents, row.currency)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{row.closer.name ?? "Sin responsable"}</TableCell>
                    <TableCell>
                      {row.lastCollectionContact ? (
                        <div className="min-w-44 space-y-0.5">
                          <p>{formatOccurredAt(row.lastCollectionContact.occurredAt)}</p>
                          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                            {row.lastCollectionContact.note}
                          </p>
                        </div>
                      ) : "Sin contacto"}
                    </TableCell>
                    <TableCell>
                      {row.nextAction ? (
                        <div className="min-w-44 space-y-0.5">
                          <p>{formatDay(row.nextAction.scheduledFor)}</p>
                          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                            {row.nextAction.note}
                          </p>
                        </div>
                      ) : "Sin próxima acción"}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-44 space-y-1">
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          {financialStatusLabel(row.financialStatus)}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {operationalStatusLabel(row.operationalStatus)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <CollectionFollowUpDialog
                        installmentId={row.installmentId}
                        leadName={row.lead.name}
                        onConfirm={(input) => Promise.resolve(onRecord(input))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

export function CollectionFollowUpDialog({
  installmentId,
  leadName,
  pending = false,
  onConfirm,
}: {
  installmentId: string;
  leadName: string;
  pending?: boolean;
  onConfirm: (input: CollectionFollowUpInput) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [contactNote, setContactNote] = useState("");
  const [nextActionOn, setNextActionOn] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const isBusy = pending || submitting;
  const canSubmit = contactNote.trim().length > 0
    && contactNote.trim().length <= 1_000
    && nextActionOn.length > 0
    && nextActionNote.trim().length > 0
    && nextActionNote.trim().length <= 1_000;

  function handleOpenChange(nextOpen: boolean) {
    if (isBusy) return;
    if (nextOpen && !open) {
      setContactNote("");
      setNextActionOn("");
      setNextActionNote("");
      setOperationId(crypto.randomUUID());
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    setSubmitting(true);
    try {
      await onConfirm({
        installmentId,
        operationId,
        contactNote: contactNote.trim(),
        nextActionOn,
        nextActionNote: nextActionNote.trim(),
      });
      setOpen(false);
    } catch {
      // The container presents the error. Keeping the dialog open preserves the
      // idempotency key so retrying cannot duplicate collection events.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <MessageSquareTextIcon data-icon="inline-start" />
        <span className="sr-only">Registrar seguimiento de {leadName}</span>
        <span aria-hidden="true">Seguimiento</span>
      </DialogTrigger>
      <DialogContent aria-busy={isBusy} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Seguimiento de cobro · {leadName}</DialogTitle>
          <DialogDescription>
            Registra el contacto y la próxima acción. Esto no salda la deuda: el estado financiero solo cambia con pagos efectivos o sus reversiones.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`collection-contact-${installmentId}`}>
                Contacto realizado
              </FieldLabel>
              <Textarea
                id={`collection-contact-${installmentId}`}
                maxLength={1_000}
                required
                value={contactNote}
                onChange={(event) => setContactNote(event.target.value)}
              />
              <FieldDescription>
                Describe de forma breve el canal y el resultado, sin añadir datos innecesarios.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`collection-next-date-${installmentId}`}>
                Fecha de próxima acción
              </FieldLabel>
              <Input
                id={`collection-next-date-${installmentId}`}
                type="date"
                required
                value={nextActionOn}
                onChange={(event) => setNextActionOn(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`collection-next-note-${installmentId}`}>
                Próxima acción
              </FieldLabel>
              <Textarea
                id={`collection-next-note-${installmentId}`}
                maxLength={1_000}
                required
                value={nextActionNote}
                onChange={(event) => setNextActionNote(event.target.value)}
              />
              <FieldDescription>
                La fecha y la nota quedan en el historial auditable de esta cuota.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              disabled={isBusy}
              render={<Button type="button" variant="outline" />}
            >
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={isBusy || !canSubmit}>
              <CalendarClockIcon data-icon="inline-start" />
              {isBusy ? "Guardando…" : "Guardar seguimiento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
