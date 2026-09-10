"use client";

import { usePermissions } from "@crm-fran/ui/permissions";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Input } from "@crm-fran/ui/components/input";
import { useState } from "react";
import { toast } from "sonner";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

export function AdminExportPanel() {
  const permissions = usePermissions();
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today);
  const [currency, setCurrency] = useState("EUR");
  const [includePii, setIncludePii] = useState(false);
  const [downloading, setDownloading] = useState(false);
  if (!permissions.includes("*")) return null;
  const download = async () => {
    setDownloading(true);
    try {
      const query = new URLSearchParams({ from, to, currency, includePii: String(includePii) });
      const response = await fetch(`/api/admin/exports?${query}`);
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "No se pudo generar la exportación");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "crm-export.zip";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = fileName; link.click();
      URL.revokeObjectURL(url);
      toast.success("Exportación generada y auditada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la exportación");
    } finally {
      setDownloading(false);
    }
  };
  return <Card><CardHeader><CardTitle>Exportación administrativa</CardTitle><CardDescription>Descarga un ZIP interoperable con CSV brutos/canónicos, métricas procesadas, manifiesto, fórmulas y marca temporal Europe/Madrid.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-4">
    <label className="grid gap-2 text-sm font-medium">Desde<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-medium">Hasta<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-medium">Moneda<Input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label>
    <div className="flex flex-col justify-end gap-3"><label className="flex items-center gap-2 text-sm"><Checkbox checked={includePii} onCheckedChange={setIncludePii} />Incluir email y teléfono (PII)</label><Button disabled={downloading || !from || !to || from > to} onClick={() => void download()}>{downloading ? "Generando…" : "Descargar ZIP"}</Button></div>
  </CardContent></Card>;
}
