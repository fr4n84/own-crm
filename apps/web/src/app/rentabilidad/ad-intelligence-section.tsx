"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@crm-fran/ui/components/chart";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";

import { trpc } from "@/utils/trpc";

type AttributionRow = {
  id: string;
  name: string;
  context?: string;
  spendCents: number;
  estimatedRevenueCents: number;
  estimatedContributionCents: number;
  leads: number;
  contacted: number;
  appointments: number;
  shows: number;
  sales: number;
  costPerLeadCents: number | null;
  customerAcquisitionCostCents: number | null;
  roas: number | null;
  leadToSaleRate: number;
  confidence: "low" | "medium" | "high";
  sampleLabel: string;
};
type AttributionForm = { source: string; campaign: string; ad: string; creative: string; acquisitionAngle: string };
const emptyForm: AttributionForm = { source: "", campaign: "", ad: "", creative: "", acquisitionAngle: "" };
const chartConfig = { spend: { label: "Gasto asignado", color: "var(--chart-1)" }, revenue: { label: "Ingreso estimado", color: "var(--chart-2)" } } satisfies ChartConfig;
const money = (value: number | null, currency: string) => value === null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(value / 100);

function AttributionInfo() {
  return <Popover><PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Cómo funciona la inteligencia de anuncios" />}><InfoIcon aria-hidden="true" /></PopoverTrigger><PopoverContent align="start"><PopoverHeader><PopoverTitle>Cómo se calcula</PopoverTitle><PopoverDescription>Usa la atribución actual guardada en cada lead. Reparte gasto manual en céntimos enteros y no reconstruye recorridos históricos ni conecta plataformas publicitarias.</PopoverDescription></PopoverHeader></PopoverContent></Popover>;
}

function AttributionBreakdown({ title, description, rows, currency }: { title: string; description: string; rows: readonly AttributionRow[]; currency: string }) {
  if (rows.length === 0) return <Empty heading={`Sin ${title.toLowerCase()}`} description="No hay leads atribuibles dentro del periodo y gasto seleccionados." />;
  const chartData = rows.slice(0, 8).map((row) => ({ name: row.name, spend: row.spendCents / 100, revenue: row.estimatedRevenueCents / 100 }));
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><ChartContainer config={chartConfig} className="min-h-64 w-full"><BarChart accessibilityLayer data={chartData}><CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value) * 100, currency)} />} /><Bar dataKey="spend" fill="var(--color-spend)" radius={4} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} /></BarChart></ChartContainer><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Valor actual</TableHead><TableHead>Embudo</TableHead><TableHead>Economía estimada</TableHead><TableHead>Muestra</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><div className="flex flex-col"><span>{row.name}</span>{row.context ? <span className="text-xs text-muted-foreground">{row.context}</span> : null}</div></TableCell><TableCell>{row.leads} → {row.contacted} → {row.appointments} → {row.shows} → {row.sales} · Conversión {(row.leadToSaleRate * 100).toFixed(1)}%</TableCell><TableCell>CPL {money(row.costPerLeadCents, currency)} · CAC {money(row.customerAcquisitionCostCents, currency)} · ROAS {row.roas?.toFixed(2) ?? "—"}x · retorno {money(row.estimatedContributionCents, currency)}</TableCell><TableCell><Badge variant={row.confidence === "low" ? "outline" : "secondary"}>{row.sampleLabel}</Badge></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>;
}

export function AdIntelligenceSection({ ads, creatives, acquisitionAngles, currency }: { ads: readonly AttributionRow[]; creatives: readonly AttributionRow[]; acquisitionAngles: readonly AttributionRow[]; currency: string }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [leadId, setLeadId] = useState("");
  const [form, setForm] = useState<AttributionForm>(emptyForm);
  const leadsQuery = useQuery(trpc.profitability.attributionLeads.queryOptions({ query: search, limit: 50 }));
  const leads = leadsQuery.data ?? [];
  const selectedLead = leads.find((lead) => lead.id === leadId);
  const update = useMutation(trpc.leads.updateAcquisitionAttribution.mutationOptions({
    onSuccess: (result) => {
      toast.success(result.changed ? "Atribución actualizada y auditada" : "No había cambios que guardar");
      void client.invalidateQueries({ queryKey: trpc.profitability.attributionLeads.queryKey() });
      void client.invalidateQueries({ queryKey: trpc.profitability.overview.queryKey() });
    },
    onError: (error) => toast.error(error.message),
  }));
  const chooseLead = (id: string | null) => {
    const nextId = id ?? "";
    setLeadId(nextId);
    const lead = leads.find((candidate) => candidate.id === nextId);
    setForm(lead ? { source: lead.source ?? "", campaign: lead.campaign ?? "", ad: lead.ad ?? "", creative: lead.creative ?? "", acquisitionAngle: lead.acquisitionAngle ?? "" } : emptyForm);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setLeadId("");
    setForm(emptyForm);
  };
  const save = () => {
    if (!selectedLead) return;
    update.mutate({ leadId: selectedLead.id, source: form.source.trim() || null, campaign: form.campaign.trim() || null, ad: form.ad.trim() || null, creative: form.creative.trim() || null, acquisitionAngle: form.acquisitionAngle.trim() || null });
  };
  const labels = { source: "Fuente", campaign: "Campaña", ad: "Anuncio", creative: "Creatividad", acquisitionAngle: "Ángulo de captación" } as const;

  return <div className="flex flex-col gap-4"><Card><CardHeader><div className="flex items-center gap-1"><CardTitle>Inteligencia de anuncios</CardTitle><AttributionInfo /></div><CardDescription>Atribución CURRENT single-touch: cada lead aparece bajo sus valores vigentes, no bajo un histórico multicanal. El gasto asignado y el retorno son estimaciones; el ledger financiero real permanece separado. No hay APIs publicitarias, cambios automáticos ni clasificaciones ocultas.</CardDescription></CardHeader></Card><AttributionBreakdown title="Anuncios" description="Compara el anuncio declarado en la atribución actual del lead." rows={ads} currency={currency} /><AttributionBreakdown title="Creatividades" description="Compara piezas creativas sin mezclarlas con las motivaciones declaradas por el lead." rows={creatives} currency={currency} /><AttributionBreakdown title="Ángulos de captación" description="Compara el mensaje publicitario de captación; no es el ángulo de motivación inferido en la conversación." rows={acquisitionAngles} currency={currency} /><Card><CardHeader><CardTitle>Editar atribución actual</CardTitle><CardDescription>Solo administración. La búsqueda se ejecuta en el servidor sobre todo el histórico. Cada cambio real genera un evento de auditoría; guardar los mismos valores no lo genera.</CardDescription></CardHeader><CardContent>{leadsQuery.isPending ? <div className="flex flex-col gap-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-40 w-full" /></div> : leadsQuery.isError ? <Empty heading="No se pudieron cargar los leads" description="Revisa la conexión o los permisos de administración." /> : <FieldGroup><Field><FieldLabel htmlFor="attribution-search">Buscar lead</FieldLabel><Input id="attribution-search" value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Nombre o email" /><FieldDescription>Busca en todo el histórico; se muestran hasta 50 coincidencias.</FieldDescription></Field>{leads.length === 0 ? <Empty heading="Sin coincidencias" description="Prueba con otro nombre o email." /> : <Field><FieldLabel>Lead</FieldLabel><Select items={leads.map((lead) => ({ label: `${lead.name} · ${lead.email}`, value: lead.id }))} value={leadId || null} onValueChange={chooseLead}><SelectTrigger className="w-full" aria-label="Lead"><SelectValue placeholder="Selecciona un lead" /></SelectTrigger><SelectContent><SelectGroup>{leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.name} · {lead.email}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}{(["source", "campaign", "ad", "creative", "acquisitionAngle"] as const).map((key) => <Field key={key}><FieldLabel htmlFor={`attribution-${key}`}>{labels[key]}</FieldLabel><Input id={`attribution-${key}`} maxLength={200} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} disabled={!selectedLead} /></Field>)}<Button onClick={save} disabled={!selectedLead || update.isPending}>{update.isPending ? "Guardando…" : "Guardar atribución"}</Button></FieldGroup>}</CardContent></Card></div>;
}
