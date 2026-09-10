"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, FileTextIcon, PencilIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@crm-fran/ui/components/dialog";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";

import { trpc } from "@/utils/trpc";
import { describeReceivable, formatReceivableMoney } from "./receivable-label";
import { PaymentReconciliationPanel } from "./payment-reconciliation-panel";
import { AdminExportPanel } from "./admin-export-panel";
import { formatSalePaymentPlan } from "./sale-payment-label";

type ContractFile = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};

type EditorState = {
  leadId: string;
  leadName: string;
  salesCallUrl: string;
  saleAmount: string;
  amountPaid: string;
  soldOn: string;
  paymentMethod: "" | "fullpay" | "financed";
  financingProvider: string;
  installmentMonths: string;
  financialOperationId: string;
  onboardingCompleted: boolean;
  onboardingVideoUrl: string;
  contract: ContractFile | null | undefined;
  currentContractName: string | null;
  receivable: {
    currency: string;
    contractedCents: number;
    collectedCents: number;
    outstandingCents: number;
    overdueCents: number;
    nextDueOn: string | null;
    installments: Array<{
      id: string;
      sequence: number;
      dueOn: string;
      expectedCents: number;
      paidCents: number;
      outstandingCents: number;
      status: "paid" | "partial" | "pending";
    }>;
  } | null;
};

export function CloserSalesView() {
  const client = useQueryClient();
  const sales = useQuery(trpc.closerSales.list.queryOptions());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [uploading, setUploading] = useState(false);
  const update = useMutation(trpc.closerSales.update.mutationOptions({
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: trpc.closerSales.list.queryKey() });
      toast.success("Venta actualizada");
      setEditor(null);
    },
    onError: (error) => toast.error(error.message),
  }));

  const rows = sales.data ?? [];
  const totals = totalsByCurrency(rows);
  const openEditor = (sale: (typeof rows)[number]) => setEditor({
    leadId: sale.id,
    leadName: sale.name,
    salesCallUrl: sale.record?.salesCallUrl ?? "",
    saleAmount: sale.record ? String(sale.record.saleAmountCents / 100) : "",
    amountPaid: sale.record ? String(sale.record.amountPaidCents / 100) : "0",
    soldOn: sale.record?.soldAt
      ? new Date(sale.record.soldAt).toISOString().slice(0, 10)
      : "",
    paymentMethod: sale.record?.paymentMethod ?? "",
    financingProvider: sale.record?.financingProvider ?? "",
    installmentMonths: sale.record?.installmentMonths
      ? String(sale.record.installmentMonths)
      : "",
    financialOperationId: crypto.randomUUID(),
    onboardingCompleted: sale.record?.onboardingCompleted ?? false,
    onboardingVideoUrl: sale.record?.onboardingVideoUrl ?? "",
    contract: undefined,
    currentContractName: sale.record?.contractFileName ?? null,
    receivable: sale.receivable,
  });
  const uploadContract = async (file: File) => {
    if (!editor) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("contract", file);
      const response = await fetch("/api/closer-sales/contracts", { method: "POST", body });
      const payload = await response.json() as ContractFile | { error?: string };
      if (!response.ok || !("storageKey" in payload)) {
        throw new Error("error" in payload ? payload.error : "No se pudo cargar el contrato");
      }
      setEditor((current) => current ? { ...current, contract: payload, currentContractName: payload.fileName } : current);
      toast.success("Contrato preparado para guardar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el contrato");
    } finally {
      setUploading(false);
    }
  };
  const save = () => {
    if (!editor) return;
    const saleAmountCents = Math.round(Number(editor.saleAmount) * 100);
    const amountPaidCents = Math.round(Number(editor.amountPaid) * 100);
    if (!Number.isInteger(saleAmountCents) || saleAmountCents <= 0) {
      toast.error("Introduce un importe de venta válido");
      return;
    }
    if (!Number.isInteger(amountPaidCents) || amountPaidCents < 0 || amountPaidCents > saleAmountCents) {
      toast.error("El importe cobrado debe estar entre 0 y el total de la venta");
      return;
    }
    if (!editor.soldOn) {
      toast.error("Selecciona la fecha de venta");
      return;
    }
    const installmentMonths = editor.paymentMethod === "financed"
      ? Number(editor.installmentMonths)
      : null;
    if (
      editor.paymentMethod === "financed"
      && (editor.financingProvider.trim() === ""
        || !Number.isInteger(installmentMonths)
        || installmentMonths === null
        || installmentMonths < 1
        || installmentMonths > 600)
    ) {
      toast.error("Indica la financiera y un número de meses válido");
      return;
    }
    update.mutate({
      leadId: editor.leadId,
      contract: editor.contract,
      salesCallUrl: editor.salesCallUrl.trim() || null,
      saleAmountCents,
      amountPaidCents,
      soldOn: editor.soldOn,
      paymentMethod: editor.paymentMethod || null,
      financingProvider: editor.paymentMethod === "financed"
        ? editor.financingProvider.trim()
        : null,
      installmentMonths,
      financialOperationId: editor.financialOperationId,
      onboardingCompleted: editor.onboardingCompleted,
      onboardingVideoUrl: editor.onboardingVideoUrl.trim() || null,
    });
  };

  if (sales.isPending) {
    return <div className="flex flex-col gap-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-80 w-full" /></div>;
  }
  if (sales.isError) {
    return <Empty heading="No se pudieron cargar las ventas" description="Comprueba tu acceso de ventas y vuelve a intentarlo." />;
  }

  return (
    <main className="dashboard-arc-theme flex min-h-full min-w-0 flex-col gap-4 bg-background p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Ventas closer</h1>
          <Badge variant="outline">Seguimiento postventa</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Centraliza contrato, llamada de venta y onboarding de cada lead vendido.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Ventas" value={rows.length} />
        <Metric title="Contratado" value={formatCurrencyTotals(totals, "contractedCents")} />
        <Metric title="Cobrado" value={formatCurrencyTotals(totals, "collectedCents")} />
        <Metric title="Pendiente" value={formatCurrencyTotals(totals, "outstandingCents")} />
        <Metric title="Onboarding pendiente" value={rows.filter((sale) => !sale.record?.onboardingCompleted).length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cartera de ventas</CardTitle>
          <CardDescription>El importe contratado y el cobrado alimentan automáticamente la verdad económica. Las ventas heredadas siguen marcadas como información parcial.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? <Empty heading="Todavía no hay ventas" description="Aparecerán cuando el feedback del closer marque Venta o exista una venta heredada confirmada." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Origen</TableHead><TableHead>Closer</TableHead><TableHead>Contratado</TableHead><TableHead>Forma de pago</TableHead><TableHead>Cobrado</TableHead><TableHead>Próximo vencimiento / diferencia</TableHead><TableHead>Evidencia</TableHead><TableHead>Contrato</TableHead><TableHead>Onboarding</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell><div className="flex min-w-48 flex-col"><span className="font-medium">{sale.name}</span><span className="text-xs text-muted-foreground">{sale.email || sale.phone}</span></div></TableCell>
                  <TableCell>{sale.source && sale.campaign ? `${sale.source} · ${sale.campaign}` : "Sin atribuir"}</TableCell>
                  <TableCell>{sale.closer?.name ?? "Sin closer"}</TableCell>
                  <TableCell>{sale.record ? money(sale.record.saleAmountCents) : "Pendiente"}</TableCell>
                  <TableCell>{sale.record ? formatSalePaymentPlan(sale.record) : "Sin clasificar"}</TableCell>
                  <TableCell>{sale.record ? <PaymentBadge paid={sale.record.amountPaidCents} total={sale.record.saleAmountCents} /> : "Pendiente"}</TableCell>
                  <TableCell>{sale.receivable ? <ReceivableStatus receivable={sale.receivable} /> : "Pendiente de configurar"}</TableCell>
                  <TableCell><Badge variant={sale.saleEvidence === "confirmed" ? "secondary" : "outline"}>{sale.saleEvidence === "confirmed" ? "Confirmada" : "Dato heredado parcial"}</Badge></TableCell>
                  <TableCell>{sale.record?.contractUrl ? <Button variant="outline" size="sm" render={<a href={sale.record.contractUrl} target="_blank" rel="noreferrer" />}><FileTextIcon data-icon="inline-start" />Ver contrato</Button> : "Pendiente"}</TableCell>
                  <TableCell><Badge variant={sale.record?.onboardingCompleted ? "secondary" : "outline"}>{sale.record?.onboardingCompleted ? "Realizado" : "Pendiente"}</Badge></TableCell>
                  <TableCell><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openEditor(sale)}><PencilIcon data-icon="inline-start" />Gestionar</Button>{sale.record?.salesCallUrl ? <Button variant="ghost" size="sm" render={<a href={sale.record.salesCallUrl} target="_blank" rel="noreferrer" />}><ExternalLinkIcon data-icon="inline-start" />Llamada</Button> : null}{sale.record?.onboardingVideoUrl ? <Button variant="ghost" size="sm" render={<a href={sale.record.onboardingVideoUrl} target="_blank" rel="noreferrer" />}><ExternalLinkIcon data-icon="inline-start" />Onboarding</Button> : null}</div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <PaymentReconciliationPanel />
      <AdminExportPanel />

      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Gestionar venta · {editor?.leadName}</DialogTitle><DialogDescription>Guarda documentación y seguimiento operativo. Los enlaces deben comenzar por http:// o https://.</DialogDescription></DialogHeader>
          {editor ? <FieldGroup>
            <Field><FieldLabel htmlFor="sale-contract">Contrato</FieldLabel><Input id="sale-contract" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadContract(file); }} /><FieldDescription>{editor.currentContractName ? `Archivo: ${editor.currentContractName}` : "PDF, Word o imagen. Máximo 20 MB."}</FieldDescription>{editor.currentContractName ? <Button variant="ghost" size="sm" onClick={() => setEditor({ ...editor, contract: null, currentContractName: null })}>Quitar contrato</Button> : null}</Field>
            <Field><FieldLabel htmlFor="sales-call-url">Enlace de la llamada de venta</FieldLabel><Input id="sales-call-url" type="url" placeholder="https://..." value={editor.salesCallUrl} onChange={(event) => setEditor({ ...editor, salesCallUrl: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="sale-date">Fecha de venta</FieldLabel><Input id="sale-date" type="date" value={editor.soldOn} onChange={(event) => setEditor({ ...editor, soldOn: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="sale-amount">Importe de la venta (€)</FieldLabel><Input id="sale-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={editor.saleAmount} onChange={(event) => setEditor({ ...editor, saleAmount: event.target.value })} /><FieldDescription>Registra el total contratado, aunque todavía no se haya cobrado entero.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="payment-method">Forma de pago</FieldLabel><Select value={editor.paymentMethod || null} onValueChange={(value) => setEditor({ ...editor, paymentMethod: (value ?? "") as EditorState["paymentMethod"], financingProvider: value === "financed" ? editor.financingProvider : "", installmentMonths: value === "financed" ? editor.installmentMonths : "" })} items={[{ value: "fullpay", label: "Fullpay" }, { value: "financed", label: "Financiada" }]}><SelectTrigger id="payment-method"><SelectValue>{editor.paymentMethod === "fullpay" ? "Fullpay" : editor.paymentMethod === "financed" ? "Financiada" : "Sin clasificar"}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="fullpay">Fullpay</SelectItem><SelectItem value="financed">Financiada</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>Las ventas antiguas permanecen sin clasificar hasta que se editen.</FieldDescription></Field>
            {editor.paymentMethod === "financed" ? <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="financing-provider">Financiera</FieldLabel><Input id="financing-provider" value={editor.financingProvider} onChange={(event) => setEditor({ ...editor, financingProvider: event.target.value })} /></Field><Field><FieldLabel htmlFor="installment-months">Número de meses</FieldLabel><Input id="installment-months" type="number" min="1" max="600" step="1" value={editor.installmentMonths} onChange={(event) => setEditor({ ...editor, installmentMonths: event.target.value })} /></Field></div> : null}
            <Field><FieldLabel htmlFor="amount-paid">Importe cobrado (€)</FieldLabel><Input id="amount-paid" type="number" min="0" step="0.01" inputMode="decimal" value={editor.amountPaid} onChange={(event) => setEditor({ ...editor, amountPaid: event.target.value })} /><FieldDescription>0 significa pendiente; un importe menor al total aparecerá como cobro parcial. Los nuevos cobros se registran con la fecha actual.</FieldDescription></Field>
            {editor.receivable ? <ReceivableInstallments receivable={editor.receivable} /> : null}
            <label className="flex min-h-11 items-center gap-3"><Checkbox checked={editor.onboardingCompleted} onCheckedChange={(checked) => setEditor({ ...editor, onboardingCompleted: checked })} /><span className="font-medium">Onboarding realizado</span></label>
            <Field><FieldLabel htmlFor="onboarding-video-url">Enlace al vídeo de onboarding</FieldLabel><Input id="onboarding-video-url" type="url" placeholder="https://..." value={editor.onboardingVideoUrl} onChange={(event) => setEditor({ ...editor, onboardingVideoUrl: event.target.value })} /></Field>
          </FieldGroup> : null}
          <DialogFooter><Button variant="outline" onClick={() => setEditor(null)}>Cancelar</Button><Button onClick={save} disabled={update.isPending || uploading}><UploadIcon data-icon="inline-start" />{update.isPending ? "Guardando…" : "Guardar venta"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const money = (cents: number) => formatReceivableMoney(cents);

function totalsByCurrency(rows: Array<{ record: { currency: string; saleAmountCents: number; amountPaidCents: number } | null; receivable: { currency: string; contractedCents: number; collectedCents: number; outstandingCents: number } | null }>) {
  const totals = new Map<string, { contractedCents: number; collectedCents: number; outstandingCents: number }>();
  for (const sale of rows) {
    const currency = sale.receivable?.currency ?? sale.record?.currency ?? "EUR";
    const current = totals.get(currency) ?? { contractedCents: 0, collectedCents: 0, outstandingCents: 0 };
    current.contractedCents += sale.receivable?.contractedCents ?? sale.record?.saleAmountCents ?? 0;
    current.collectedCents += sale.receivable?.collectedCents ?? sale.record?.amountPaidCents ?? 0;
    current.outstandingCents += sale.receivable?.outstandingCents ?? Math.max((sale.record?.saleAmountCents ?? 0) - (sale.record?.amountPaidCents ?? 0), 0);
    totals.set(currency, current);
  }
  return totals;
}

function formatCurrencyTotals(totals: Map<string, { contractedCents: number; collectedCents: number; outstandingCents: number }>, field: "contractedCents" | "collectedCents" | "outstandingCents") {
  if (totals.size === 0) return formatReceivableMoney(0);
  return [...totals.entries()].map(([currency, total]) => formatReceivableMoney(total[field], currency)).join(" · ");
}

function ReceivableStatus({ receivable }: { receivable: ReceivableOverviewWithInstallments }) {
  const description = describeReceivable(receivable);
  return <div className="flex min-w-48 flex-col gap-1"><Badge variant={description.tone === "settled" ? "secondary" : "outline"} className={description.tone === "overdue" ? "border-destructive/40 text-destructive" : undefined}>{description.state}</Badge><span className="text-xs text-muted-foreground">{description.detail}</span></div>;
}

type ReceivableOverviewWithInstallments = NonNullable<EditorState["receivable"]>;

function ReceivableInstallments({ receivable }: { receivable: NonNullable<EditorState["receivable"]> }) {
  return <section className="rounded-lg border bg-muted/30 p-4" aria-labelledby="receivable-installments-title"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 id="receivable-installments-title" className="font-semibold">Cuenta por cobrar</h3><p className="text-sm text-muted-foreground">Historial por cuotas; las correcciones financieras se conservan mediante reversiones.</p></div><ReceivableStatus receivable={receivable} /></div><div className="max-h-64 space-y-2 overflow-y-auto pr-1">{receivable.installments.map((installment) => <div key={installment.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm"><span className="font-medium">#{installment.sequence}</span><span><span className="block">Vence {formatReceivableDay(installment.dueOn)}</span><span className="text-xs text-muted-foreground">{installment.status === "paid" ? "Cobrada" : installment.status === "partial" ? "Cobro parcial" : "Pendiente"}</span></span><span className="text-right"><span className="block font-medium">{formatReceivableMoney(installment.expectedCents, receivable.currency)}</span><span className="text-xs text-muted-foreground">Pendiente {formatReceivableMoney(installment.outstandingCents, receivable.currency)}</span></span></div>)}</div></section>;
}

function formatReceivableDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

function PaymentBadge({ paid, total }: { paid: number; total: number }) {
  const label = paid <= 0 ? "Pendiente" : paid >= total ? "Cobrado" : `Parcial · ${money(paid)}`;
  return <Badge variant={paid >= total ? "secondary" : "outline"}>{label}</Badge>;
}

function Metric({ title, value }: { title: string; value: ReactNode }) {
  return <Card size="sm"><CardHeader><CardDescription>{title}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>;
}
