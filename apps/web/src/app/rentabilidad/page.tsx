"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@crm-fran/ui/components/chart";
import { Empty } from "@crm-fran/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@crm-fran/ui/components/popover";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@crm-fran/ui/components/tabs";

import { trpc } from "@/utils/trpc";
import { AdIntelligenceSection } from "./ad-intelligence-section";
import { FinancialTruthSection } from "./financial-truth-section";
import { resolveSpendDates, type SpendEntryMode } from "./spend-entry";

type SpendForm = {
  id?: string;
  mode: SpendEntryMode;
  date: string;
  source: string;
  campaign: string;
  periodStart: string;
  periodEnd: string;
  spendEuros: string;
  referenceSaleValueEuros: string;
  currency: string;
};

type MetricRow = {
  id?: string;
  name?: string;
  source?: string;
  campaign?: string;
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
};

const today = new Date();
const ninetyDaysAgo = new Date(today);
ninetyDaysAgo.setDate(today.getDate() - 89);
const day = (date: Date | string) =>
  (typeof date === "string" ? new Date(date) : date).toISOString().slice(0, 10);
const initialForm: SpendForm = {
  mode: "daily",
  date: day(today),
  source: "",
  campaign: "",
  periodStart: day(today),
  periodEnd: day(today),
  spendEuros: "",
  referenceSaleValueEuros: "",
  currency: "EUR",
};
const money = (value: number | null, currency: string) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
      }).format(value / 100);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const chartConfig = {
  spend: { label: "Gasto", color: "var(--chart-1)" },
  revenue: { label: "Ingreso estimado", color: "var(--chart-2)" },
} satisfies ChartConfig;

function Info({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" className="size-11" aria-label={label} />}
      >
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function SectionTitle({
  title,
  information,
}: {
  title: string;
  information: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <CardTitle>{title}</CardTitle>
      <Info label={`Información sobre ${title}`} title={title}>
        {information}
      </Info>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function MetricsTable({
  rows,
  identity,
  currency,
}: {
  rows: readonly MetricRow[];
  identity: "name" | "campaign";
  currency: string;
}) {
  if (rows.length === 0) {
    return <Empty heading="Sin datos atribuibles" description="Añade gasto para una campaña con leads dentro del mismo periodo." />;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{identity === "campaign" ? "Campaña" : "Segmento"}</TableHead>
            <TableHead>Gasto</TableHead>
            <TableHead>Leads</TableHead>
            <TableHead>Ventas</TableHead>
            <TableHead>CPL</TableHead>
            <TableHead>CAC</TableHead>
            <TableHead>ROAS</TableHead>
            <TableHead>Retorno estimado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id ?? `${row.source}-${row.campaign}`}>
              <TableCell>
                {identity === "campaign"
                  ? `${row.source ?? "Sin fuente"} · ${row.campaign ?? "Sin campaña"}`
                  : row.name}
              </TableCell>
              <TableCell>{money(row.spendCents, currency)}</TableCell>
              <TableCell>{row.leads}</TableCell>
              <TableCell>{row.sales}</TableCell>
              <TableCell>{money(row.costPerLeadCents, currency)}</TableCell>
              <TableCell>{money(row.customerAcquisitionCostCents, currency)}</TableCell>
              <TableCell>{row.roas === null ? "—" : `${row.roas.toFixed(2)}x`}</TableCell>
              <TableCell>{money(row.estimatedContributionCents, currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CampaignTable({ rows, currency }: { rows: readonly (MetricRow & { suggestion: { action: string; suggestedBudgetChangePercent: number; reasons: string[] } })[]; currency: string }) {
  if (rows.length === 0) {
    return <Empty heading="Sin campañas calculables" description="Registra el gasto y el valor de venta de una campaña para generar sugerencias." />;
  }
  const label = (action: string, change: number) => {
    if (action === "increase") return `Aumentar ${change}%`;
    if (action === "reduce") return `Reducir ${Math.abs(change)}%`;
    if (action === "wait") return "Esperar más datos";
    return "Mantener";
  };
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Campaña</TableHead><TableHead>Embudo</TableHead><TableHead>Economía</TableHead><TableHead>Sugerencia</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((row) => <TableRow key={`${row.source}-${row.campaign}`}><TableCell>{row.source} · {row.campaign}</TableCell><TableCell>{row.leads} leads → {row.contacted} contactos → {row.appointments} agendas → {row.shows} shows → {row.sales} ventas</TableCell><TableCell>CPL {money(row.costPerLeadCents, currency)} · CAC {money(row.customerAcquisitionCostCents, currency)} · ROAS {row.roas?.toFixed(2) ?? "—"}x</TableCell><TableCell><Badge variant={row.suggestion.action === "reduce" ? "destructive" : "outline"}>{label(row.suggestion.action, row.suggestion.suggestedBudgetChangePercent)}</Badge></TableCell><TableCell>{row.suggestion.reasons.join(" ")}</TableCell></TableRow>)}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ProfitabilityPage() {
  const client = useQueryClient();
  const [from, setFrom] = useState(day(ninetyDaysAgo));
  const [to, setTo] = useState(day(today));
  const [currency, setCurrency] = useState("EUR");
  const [form, setForm] = useState<SpendForm>(initialForm);
  const overview = useQuery(
    trpc.profitability.overview.queryOptions({ from, to, currency }),
  );
  const refresh = () =>
    void client.invalidateQueries({
      queryKey: trpc.profitability.overview.queryKey({ from, to, currency }),
    });
  const save = useMutation(
    trpc.profitability.saveSpend.mutationOptions({
      onSuccess: () => {
        toast.success(form.id ? "Gasto actualizado" : "Gasto registrado");
        setForm(initialForm);
        refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    trpc.profitability.deleteSpend.mutationOptions({
      onSuccess: () => {
        toast.success("Gasto eliminado");
        refresh();
      },
      onError: () => toast.error("No se pudo eliminar el gasto"),
    }),
  );

  if (overview.isPending) {
    return <main className="dashboard-arc-theme flex flex-col gap-4 bg-background p-4 sm:p-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></main>;
  }
  if (overview.isError || !overview.data) {
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><Empty heading="No se pudo cargar la rentabilidad" description="Esta sección requiere permisos de administración global." /></main>;
  }

  const data = overview.data;
  const submit = () => {
    const dates = resolveSpendDates({
      mode: form.mode,
      date: form.date,
      from: form.periodStart,
      to: form.periodEnd,
    });
    const value = {
      source: form.source,
      campaign: form.campaign,
      ...dates,
      spendEuros: Number(form.spendEuros),
      referenceSaleValueEuros: Number(form.referenceSaleValueEuros),
      currency: form.currency,
    };
    save.mutate(form.id ? { ...value, id: form.id } : value);
  };
  const edit = (period: (typeof data.spendPeriods)[number]) =>
    setForm({
      id: period.id,
      mode: day(period.periodStart) === day(period.periodEnd) ? "daily" : "period",
      date: day(period.periodStart),
      source: period.source,
      campaign: period.campaign,
      periodStart: day(period.periodStart),
      periodEnd: day(period.periodEnd),
      spendEuros: String(period.spendCents / 100),
      referenceSaleValueEuros: String(period.referenceSaleValueCents / 100),
      currency: period.currency,
    });
  const chartData = data.campaigns.map((campaign) => ({
    campaign: campaign.campaign,
    spend: campaign.spendCents / 100,
    revenue: campaign.estimatedRevenueCents / 100,
  }));

  return (
    <main className="dashboard-arc-theme flex min-h-full flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Rentabilidad y atribución</h1>
          <Info label="Información sobre rentabilidad" title="Cómo se calcula">
            El gasto se introduce manualmente y se reparte entre los leads de la misma fuente, campaña y periodo. Las ventas proceden del feedback real del closer y se valoran con el importe manual por venta. No se conecta ni modifica ninguna plataforma publicitaria.
          </Info>
          <Badge variant="outline">Modo sugerencia</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Convierte el embudo comercial en recomendaciones económicas transparentes, sin automatizar presupuesto.</p>
      </header>

      <Card size="sm" className="w-fit max-w-full">
        <CardHeader className="pb-2"><SectionTitle title="Intervalo de análisis" information="Solo se incluyen periodos de gasto completamente contenidos en estas fechas y leads creados dentro del mismo intervalo." /></CardHeader>
        <CardContent className="p-3 pt-0"><FieldGroup className="flex flex-col gap-3 sm:flex-row sm:items-end"><Field className="w-full sm:w-40"><FieldLabel htmlFor="profitability-from">Desde</FieldLabel><Input className="h-11" id="profitability-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field className="w-full sm:w-40"><FieldLabel htmlFor="profitability-to">Hasta</FieldLabel><Input className="h-11" id="profitability-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><Field className="w-full sm:w-52"><FieldLabel htmlFor="profitability-currency">Moneda del análisis</FieldLabel><Select items={data.availableCurrencies.map((option) => ({ label: option, value: option }))} value={data.currency} onValueChange={(value) => value && setCurrency(value)}><SelectTrigger id="profitability-currency" aria-label="Moneda del análisis" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{data.availableCurrencies.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Las monedas se analizan por separado; nunca se aplica un tipo de cambio implícito.</FieldDescription></Field></FieldGroup></CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Gasto publicitario" value={money(data.summary.spendCents, data.currency)} description={`${data.summary.leads} leads atribuidos`} />
        <MetricCard title="Ingreso estimado" value={money(data.summary.estimatedRevenueCents, data.currency)} description={`${data.summary.sales} ventas registradas`} />
        <MetricCard title="ROAS estimado" value={data.summary.roas === null ? "—" : `${data.summary.roas.toFixed(2)}x`} description="Ingreso estimado dividido entre gasto" />
        <MetricCard title="Retorno antes de costes" value={money(data.summary.estimatedContributionCents, data.currency)} description="Ingreso estimado menos publicidad; no es beneficio neto" />
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="flex h-auto w-fit max-w-full flex-nowrap gap-1 rounded-lg border bg-muted/40 p-1"><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="summary">Resumen</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="truth">Verdad económica</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="campaigns">Campañas</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="ads">Anuncios, creatividades y ángulos</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="team">Equipo</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="profiles">Perfiles</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="spend">Gastos</TabsTrigger></TabsList>

        <TabsContent value="summary" className="flex flex-col gap-4">
          <Card><CardHeader><SectionTitle title="Gasto frente a ingreso estimado" information="El ingreso no representa caja cobrada: ventas multiplicadas por el valor manual de referencia. Úsalo para comparar campañas con el mismo criterio." /><CardDescription>{data.methodology}</CardDescription></CardHeader><CardContent>{chartData.length === 0 ? <Empty heading="Sin comparativa" description="Añade un periodo de gasto para dibujar la comparativa." /> : <ChartContainer config={chartConfig} className="min-h-72 w-full"><BarChart accessibilityLayer data={chartData}><CartesianGrid vertical={false} /><XAxis dataKey="campaign" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value) * 100, data.currency)} />} /><Bar dataKey="spend" fill="var(--color-spend)" radius={4} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} /></BarChart></ChartContainer>}</CardContent></Card>
          <Card><CardHeader><SectionTitle title="Embudo económico" information="Relaciona el coste de adquisición con cada etapa comercial para detectar si el problema está antes del contacto, la agenda, el show o la venta." /></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge variant="secondary">CPL {money(data.summary.costPerLeadCents, data.currency)}</Badge><Badge variant="secondary">CAC {money(data.summary.customerAcquisitionCostCents, data.currency)}</Badge><Badge variant="outline">Contacto {percent(data.summary.leads === 0 ? 0 : data.summary.contacted / data.summary.leads)}</Badge><Badge variant="outline">Agenda {percent(data.summary.leads === 0 ? 0 : data.summary.appointments / data.summary.leads)}</Badge><Badge variant="outline">Show {percent(data.summary.leads === 0 ? 0 : data.summary.shows / data.summary.leads)}</Badge><Badge variant="outline">Venta {percent(data.summary.leadToSaleRate)}</Badge></CardContent></Card>
        </TabsContent>

        <TabsContent value="truth"><FinancialTruthSection /></TabsContent>
        <TabsContent value="campaigns"><Card><CardHeader><SectionTitle title="Sugerencias por campaña" information="Aumentar, mantener o reducir son propuestas limitadas basadas en muestra y ROAS. Nunca se envían a Google, Meta ni otra plataforma." /></CardHeader><CardContent><CampaignTable rows={data.campaigns} currency={data.currency} /></CardContent></Card></TabsContent>
        <TabsContent value="ads"><AdIntelligenceSection ads={data.ads} creatives={data.creatives} acquisitionAngles={data.acquisitionAngles} currency={data.currency} /></TabsContent>
        <TabsContent value="team" className="flex flex-col gap-4"><Card><CardHeader><SectionTitle title="Rentabilidad atribuida a callers" information="El coste se reparte entre los leads asignados. Sirve para comparar operación, no para calcular comisiones ni demostrar causalidad individual." /></CardHeader><CardContent><MetricsTable rows={data.callers} identity="name" currency={data.currency} /></CardContent></Card><Card><CardHeader><SectionTitle title="Rentabilidad atribuida a closers" information="Las ventas y el coste de los leads se atribuyen a la última asignación registrada disponible dentro del periodo." /></CardHeader><CardContent><MetricsTable rows={data.closers} identity="name" currency={data.currency} /></CardContent></Card></TabsContent>
        <TabsContent value="profiles"><Card><CardHeader><SectionTitle title="Rentabilidad por perfil" information="Compara perfiles usando la clasificación guardada en la conversación y el mismo reparto de gasto por lead." /></CardHeader><CardContent><MetricsTable rows={data.profiles} identity="name" currency={data.currency} /></CardContent></Card></TabsContent>
        <TabsContent value="spend" className="flex flex-col gap-4">
          <Card><CardHeader><SectionTitle title={form.id ? "Editar gasto" : "Registrar gasto publicitario"} information="El modo diario guarda un único día por campaña. El modo periodo permite cargar un total acumulado; nunca se permiten fechas solapadas para la misma fuente y campaña." /><CardDescription>Introduce cuánto gastó cada campaña. No existe conexión con APIs publicitarias.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="spend-mode">Tipo de gasto</FieldLabel><Select value={form.mode} onValueChange={(value) => value && setForm({ ...form, mode: value as SpendEntryMode })}><SelectTrigger id="spend-mode"><SelectValue>{form.mode === "daily" ? "Gasto diario" : "Periodo acumulado"}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="daily">Gasto diario</SelectItem><SelectItem value="period">Periodo acumulado</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>Usa gasto diario para registrar cada campaña día a día.</FieldDescription></Field><Field><FieldLabel htmlFor="spend-source">Fuente</FieldLabel><Input id="spend-source" list="profitability-sources" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /><datalist id="profitability-sources">{[...new Set(data.campaignOptions.map((option) => option.source))].map((source) => <option key={source} value={source} />)}</datalist></Field><Field><FieldLabel htmlFor="spend-campaign">Campaña</FieldLabel><Input id="spend-campaign" list="profitability-campaigns" value={form.campaign} onChange={(event) => setForm({ ...form, campaign: event.target.value })} /><datalist id="profitability-campaigns">{data.campaignOptions.filter((option) => !form.source || option.source === form.source).map((option) => <option key={`${option.source}-${option.campaign}`} value={option.campaign} />)}</datalist></Field>{form.mode === "daily" ? <Field><FieldLabel htmlFor="spend-date">Fecha del gasto</FieldLabel><Input id="spend-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field> : <><Field><FieldLabel htmlFor="spend-start">Inicio</FieldLabel><Input id="spend-start" type="date" value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} /></Field><Field><FieldLabel htmlFor="spend-end">Fin</FieldLabel><Input id="spend-end" type="date" value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} /></Field></>}<Field><FieldLabel htmlFor="spend-form-currency">Moneda ISO</FieldLabel><Input id="spend-form-currency" list="profitability-currencies" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /><datalist id="profitability-currencies">{data.availableCurrencies.map((option) => <option key={option} value={option} />)}</datalist></Field><Field><FieldLabel htmlFor="spend-amount">{form.mode === "daily" ? "Gasto de ese día" : "Gasto total del periodo"} ({form.currency})</FieldLabel><Input id="spend-amount" type="number" min="0.01" step="0.01" value={form.spendEuros} onChange={(event) => setForm({ ...form, spendEuros: event.target.value })} /></Field><Field><FieldLabel htmlFor="sale-value">Valor de referencia por venta ({form.currency})</FieldLabel><Input id="sale-value" type="number" min="0.01" step="0.01" value={form.referenceSaleValueEuros} onChange={(event) => setForm({ ...form, referenceSaleValueEuros: event.target.value })} /><FieldDescription>Se usa para estimar ingreso; no equivale necesariamente a dinero cobrado.</FieldDescription></Field><div className="flex flex-wrap gap-2"><Button onClick={submit} disabled={save.isPending || !form.source || !form.campaign || !form.spendEuros || !form.referenceSaleValueEuros || (form.mode === "daily" ? !form.date : !form.periodStart || !form.periodEnd)}>{form.id ? "Guardar cambios" : form.mode === "daily" ? "Registrar gasto diario" : "Registrar periodo"}</Button>{form.id ? <Button variant="outline" onClick={() => setForm(initialForm)}>Cancelar edición</Button> : null}</div></FieldGroup></CardContent></Card>
          <Card><CardHeader><SectionTitle title="Historial de gastos" information="Conserva el criterio económico aplicado a cada cohorte. Editar un periodo recalcula toda la vista; eliminarlo retira su atribución." /></CardHeader><CardContent>{data.spendPeriods.length === 0 ? <Empty heading="Sin gastos registrados" description="Introduce el primer periodo para comenzar el análisis." /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fuente y campaña</TableHead><TableHead>Periodo</TableHead><TableHead>Gasto</TableHead><TableHead>Valor por venta</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{data.spendPeriods.map((period) => <TableRow key={period.id}><TableCell>{period.source} · {period.campaign}</TableCell><TableCell>{day(period.periodStart)} — {day(period.periodEnd)}</TableCell><TableCell>{money(period.spendCents, period.currency)}</TableCell><TableCell>{money(period.referenceSaleValueCents, period.currency)}</TableCell><TableCell><div className="flex gap-2"><Button variant="outline" size="icon-sm" aria-label="Editar gasto" onClick={() => edit(period)}><PencilIcon data-icon="inline-start" /></Button><Button variant="outline" size="icon-sm" aria-label="Eliminar gasto" onClick={() => remove.mutate({ id: period.id })} disabled={remove.isPending}><Trash2Icon data-icon="inline-start" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
