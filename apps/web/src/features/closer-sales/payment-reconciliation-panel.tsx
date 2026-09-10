"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@crm-fran/api/routers/index";
import { usePermissions } from "@crm-fran/ui/permissions";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@crm-fran/ui/components/dialog";
import { Input } from "@crm-fran/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { formatReceivableMoney } from "./receivable-label";

type Preview = inferRouterOutputs<AppRouter>["closerSales"]["previewReconciliation"];

export function PaymentReconciliationPanel() {
  const permissions = usePermissions();
  const isAdmin = permissions.includes("*");
  const client = useQueryClient();
  const profiles = useQuery({ ...trpc.closerSales.reconciliationProfiles.queryOptions(), enabled: isAdmin });
  const report = useQuery({ ...trpc.closerSales.cashRealizedReport.queryOptions(), enabled: isAdmin });
  const [open, setOpen] = useState(false);
  const [providerKey, setProviderKey] = useState("");
  const [providerName, setProviderName] = useState("");
  const [profileId, setProfileId] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const createProfile = useMutation(trpc.closerSales.createReconciliationProfile.mutationOptions({
    onSuccess: async (profile) => { await client.invalidateQueries({ queryKey: trpc.closerSales.reconciliationProfiles.queryKey() }); setProfileId(profile.id); toast.success("Perfil creado"); },
    onError: (error) => toast.error(error.message),
  }));
  const previewMutation = useMutation(trpc.closerSales.previewReconciliation.mutationOptions({
    onSuccess: (value) => { setPreview(value); setResolutions({}); },
    onError: (error) => toast.error(error.message),
  }));
  const confirm = useMutation(trpc.closerSales.confirmReconciliation.mutationOptions({
    onSuccess: async (result) => {
      toast.success(`${result.confirmed} cobros conciliados${result.duplicates ? `; ${result.duplicates} ya existían` : ""}`);
      await Promise.all([
        client.invalidateQueries({ queryKey: trpc.closerSales.list.queryKey() }),
        client.invalidateQueries({ queryKey: trpc.closerSales.cashRealizedReport.queryKey() }),
      ]);
      setOpen(false); setPreview(null); setCsv(""); setFileName("");
    },
    onError: (error) => toast.error(error.message),
  }));
  if (!isAdmin) return null;
  const rows = preview?.rows ?? [];
  const canConfirm = rows.length > 0 && rows.every((row) =>
    row.matchStatus === "matched"
    || row.matchStatus === "duplicate"
    || (row.matchStatus === "ambiguous" && Boolean(resolutions[row.externalReference])));

  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-4">
      <div><CardTitle>Conciliación de cobros</CardTitle><CardDescription>Importa un CSV, revisa las coincidencias y confirma. Nunca se aceptan coincidencias ambiguas automáticamente.</CardDescription></div>
      <Button onClick={() => setOpen(true)}>Importar CSV</Button>
    </CardHeader>
    <CardContent>
      {(report.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay cobros conciliados.</p> : <Table>
        <TableHeader><TableRow><TableHead>Caller</TableHead><TableHead>Closer</TableHead><TableHead>Campaña</TableHead><TableHead>Financiera</TableHead><TableHead>Cobrado conciliado</TableHead><TableHead>Margen realizado</TableHead></TableRow></TableHeader>
        <TableBody>{report.data?.map((row, index) => <TableRow key={`${row.caller}:${row.closer}:${row.campaign}:${row.financingProvider}:${row.currency}:${index}`}><TableCell>{row.caller}</TableCell><TableCell>{row.closer}</TableCell><TableCell>{row.campaign}</TableCell><TableCell>{row.financingProvider}</TableCell><TableCell>{formatReceivableMoney(row.cashCollectedCents, row.currency)}</TableCell><TableCell>{formatReceivableMoney(row.realizedMarginCents, row.currency)}</TableCell></TableRow>)}</TableBody>
      </Table>}
    </CardContent>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>Conciliar cobros por CSV</DialogTitle><DialogDescription>Formato: external_reference, amount, currency, occurred_at y, para identificar la venta, lead_id, lead_email o lead_phone. La fecha debe incluir zona horaria.</DialogDescription></DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label="Clave del proveedor" placeholder="clave-proveedor" value={providerKey} onChange={(event) => setProviderKey(event.target.value.toLowerCase())} /><Input aria-label="Nombre del proveedor" placeholder="Nombre visible" value={providerName} onChange={(event) => setProviderName(event.target.value)} /><Button variant="outline" disabled={createProfile.isPending || providerKey.length < 2 || !providerName.trim()} onClick={() => createProfile.mutate({ providerKey, name: providerName })}>Crear perfil</Button></div>
        <label className="grid gap-2 text-sm font-medium">Perfil de proveedor<select className="h-10 rounded-md border bg-background px-3" value={profileId} onChange={(event) => { setProfileId(event.target.value); setPreview(null); }}><option value="">Selecciona un perfil</option>{profiles.data?.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <Input type="file" accept=".csv,text/csv" aria-label="Archivo CSV de cobros" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { toast.error("El CSV no puede superar 2 MB"); return; } setFileName(file.name); void file.text().then((text) => { setCsv(text); setPreview(null); }); }} />
        <Button variant="outline" disabled={!profileId || !csv || previewMutation.isPending} onClick={() => previewMutation.mutate({ profileId, csv })}>{previewMutation.isPending ? "Analizando…" : "Previsualizar coincidencias"}</Button>
        {rows.length > 0 ? <Table><TableHeader><TableRow><TableHead>Referencia</TableHead><TableHead>Importe</TableHead><TableHead>Fecha</TableHead><TableHead>Coincidencia</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={`${row.rowNumber}:${row.externalReference}`}><TableCell>{row.externalReference}</TableCell><TableCell>{formatReceivableMoney(row.amountCents, row.currency)}</TableCell><TableCell>{new Date(row.occurredAt).toLocaleString("es-ES")}</TableCell><TableCell>{row.matchStatus === "matched" ? <Badge variant="secondary">{row.candidates[0]?.name}</Badge> : row.matchStatus === "duplicate" ? <Badge variant="outline">Ya conciliado / duplicado</Badge> : row.matchStatus === "unmatched" ? <Badge variant="outline">Sin coincidencia</Badge> : <select aria-label={`Resolver ${row.externalReference}`} className="h-9 rounded-md border bg-background px-2" value={resolutions[row.externalReference] ?? ""} onChange={(event) => setResolutions((current) => ({ ...current, [row.externalReference]: event.target.value }))}><option value="">Selecciona manualmente</option>{row.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>}</TableCell></TableRow>)}</TableBody></Table> : null}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={!canConfirm || confirm.isPending} onClick={() => confirm.mutate({ profileId, fileName, csv, resolutions: Object.entries(resolutions).map(([externalReference, leadId]) => ({ externalReference, leadId })) })}>{confirm.isPending ? "Confirmando…" : "Confirmar conciliación"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}
