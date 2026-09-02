"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import { FEEDBACK_PROFILES, MOTIVATION_ANGLES } from "@crm-fran/api/call-feedback";
import { Button } from "@crm-fran/ui/components/button";
import { Badge } from "@crm-fran/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@crm-fran/ui/components/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@crm-fran/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";

import { trpc } from "@/utils/trpc";
import { buildFeedbackChartData, buildReactionChartData, type FeedbackChartItem } from "./feedback-statistics-charts";
import { filterFeedbackDetails, type FeedbackDrilldownFilter } from "./feedback-statistics-drilldown";
import { selectFeedbackCaller } from "./feedback-statistics-filters";

const profileLabels = Object.fromEntries(
  FEEDBACK_PROFILES.map(({ value, label }) => [value, label]),
);
const angleLabels = Object.fromEntries(
  MOTIVATION_ANGLES.map(({ value, label }) => [value, label]),
);
const chartConfig = { value: { label: "Feedbacks" } } satisfies ChartConfig;
const chartColors = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
  "var(--chart-7)", "var(--chart-8)", "var(--chart-9)",
];

type FeedbackDetail = {
  leadId: string;
  leadName: string;
  callerName: string | null;
  source: string | null;
  campaign: string | null;
  outcome: string | null;
  profile: string | null;
  angles: readonly string[];
  summary: string;
  occurredAt: Date | string;
};

type FunnelLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  source: string | null;
  campaign: string | null;
};

type Drilldown = { title: string; items: Array<FeedbackDetail | FunnelLead> } | null;

export function FeedbackStatisticsView() {
  const [caller, setCaller] = useState({ id: "all", name: "Todos los callers" });
  const [source, setSource] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dataOrigin, setDataOrigin] = useState<"legacy" | "exact">("legacy");
  const [drilldown, setDrilldown] = useState<Drilldown>(null);
  const invalidInterval = Boolean(from && to && from > to);
  const statistics = useQuery({
    ...trpc.leads.feedbackStatistics.queryOptions({
      callerId: caller.id === "all" ? undefined : caller.id,
      source: source === "all" ? undefined : source,
      campaign: campaign === "all" ? undefined : campaign,
      from: from || undefined,
      to: to || undefined,
    }),
    enabled: !invalidInterval,
  });
  const displayedStatistics = dataOrigin === "legacy" ? statistics.data?.legacy : statistics.data;
  const chartData = buildFeedbackChartData({
    profiles: displayedStatistics?.profiles ?? [],
    angles: displayedStatistics?.angles ?? [],
    sources: displayedStatistics?.sources ?? [],
    campaigns: displayedStatistics?.campaigns ?? [],
    profileLabels,
    angleLabels,
  });

  const openFeedbackDrilldown = (title: string, filter: FeedbackDrilldownFilter) => {
    setDrilldown({
      title,
      items: filterFeedbackDetails(displayedStatistics?.feedbacks ?? [], filter),
    });
  };

  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <h2 className="text-2xl font-semibold">Feedback</h2>
          <Popover>
            <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="size-11" aria-label="Información sobre las estadísticas de feedback" />}>
              <InfoIcon aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(92vw,32rem)]">
              <PopoverHeader><PopoverTitle>Cómo interpretar Feedback</PopoverTitle><PopoverDescription>Los perfiles, ángulos, reacciones y embudos se calculan desde feedback confirmado. Los filtros y drilldowns conservan el caller, origen, campaña e intervalo seleccionados. Son asociaciones descriptivas: sirven para medir calidad y detectar segmentos, no para demostrar causalidad.</PopoverDescription></PopoverHeader>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-sm text-muted-foreground">
          Calidad, conversión y trazabilidad de perfiles, campañas y orígenes.
        </p>
      </header>

      <Filters
        caller={caller}
        source={source}
        campaign={campaign}
        from={from}
        to={to}
        invalidInterval={invalidInterval}
        callers={statistics.data?.callers ?? []}
        sources={statistics.data?.availableSources ?? []}
        campaigns={statistics.data?.availableCampaigns ?? []}
        onCallerChange={(value) => setCaller(selectFeedbackCaller(statistics.data?.callers ?? [], value))}
        onSourceChange={setSource}
        onCampaignChange={setCampaign}
        onFromChange={setFrom}
        onToChange={setTo}
      />

      <div className="flex flex-col gap-2">
        <Tabs value={dataOrigin} onValueChange={(value) => setDataOrigin(value as "legacy" | "exact")}>
          <TabsList className="h-auto w-fit max-w-full"><TabsTrigger value="legacy">Datos heredados del CSV</TabsTrigger><TabsTrigger value="exact">Actividad exacta</TabsTrigger></TabsList>
        </Tabs>
        <Card size="sm"><CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Badge variant="outline">{dataOrigin === "legacy" ? "Dato heredado" : "Dato exacto"}</Badge>
          <p className="text-sm text-muted-foreground">{dataOrigin === "legacy" ? "Se usa la columna FEEDBACK y el resultado importado. La fecha corresponde al alta del lead y nunca se mezcla con eventos reales." : "Solo incluye feedback registrado dentro del CRM con su fecha y autor reales."}</p>
        </CardContent></Card>
      </div>

      {statistics.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
        </div>
      ) : statistics.isError ? (
        <Card><CardContent className="py-8 text-sm text-destructive">No se pudieron cargar las estadísticas.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Metric title="Feedbacks" value={displayedStatistics?.totalFeedbacks ?? 0} />
            <Metric title="Con perfil" value={displayedStatistics?.classifiedFeedbacks ?? 0} />
            <Metric title="Conversión a agenda" value={`${displayedStatistics?.appointmentRate ?? 0}%`} />
          </div>

          <DataQualityPanel
            quality={displayedStatistics?.dataQuality}
            onSelect={(field, label) =>
              openFeedbackDrilldown(`Feedbacks sin ${label.toLowerCase()}`, { kind: "missing", value: field })
            }
          />

          {dataOrigin === "exact" ? <><FunnelSection
            title="Embudo por origen"
            groups={statistics.data?.funnels.sources ?? []}
            onSelect={(title, leads) => setDrilldown({ title, items: leads })}
          />
          <FunnelSection
            title="Embudo por campaña"
            groups={statistics.data?.funnels.campaigns ?? []}
            onSelect={(title, leads) => setDrilldown({ title, items: leads })}
          /></> : <Card><CardHeader><CardTitle>Embudo histórico no mezclado</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">El CSV conserva el resultado final, pero no una secuencia temporal completa. Por eso sus feedbacks se analizan aparte y no se convierten en un embudo de eventos inventados.</CardContent></Card>}

          <div className="grid gap-4 lg:grid-cols-2">
            <DonutChart title="Distribución por origen" data={chartData.sources} onSelect={(item) => openFeedbackDrilldown(`Origen: ${item.name}`, { kind: "source", value: item.key })} />
            <DonutChart title="Distribución por campaña" data={chartData.campaigns} onSelect={(item) => openFeedbackDrilldown(`Campaña: ${item.name}`, { kind: "campaign", value: item.key })} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <DonutChart title="Distribución de perfiles" data={chartData.profiles} onSelect={(item) => openFeedbackDrilldown(`Perfil: ${item.name}`, { kind: "profile", value: item.key })} />
            <DonutChart title="Reacción de los perfiles" data={chartData.reactions} onSelect={(item) => openFeedbackDrilldown(`Reacción: ${item.name}`, { kind: "reaction", value: item.key })} />
            <DonutChart title="Ángulos de motivación" data={chartData.angles} onSelect={(item) => openFeedbackDrilldown(`Ángulo: ${item.name}`, { kind: "angle", value: item.key })} />
          </div>

          <DonutChart title="Reacciones generales" data={buildReactionChartData(displayedStatistics?.reactions)} onSelect={(item) => openFeedbackDrilldown(`Reacción: ${item.name}`, { kind: "reaction", value: item.key })} />

          <div className="grid gap-4 xl:grid-cols-2">
            <AttributionTable title="Calidad por origen" rows={displayedStatistics?.sources ?? []} onSelect={(value) => openFeedbackDrilldown(`Origen: ${value}`, { kind: "source", value })} />
            <AttributionTable title="Calidad por campaña" rows={displayedStatistics?.campaigns ?? []} onSelect={(value) => openFeedbackDrilldown(`Campaña: ${value}`, { kind: "campaign", value })} />
          </div>

          <ProfileTable profiles={displayedStatistics?.profiles ?? []} />
          <AngleTable angles={displayedStatistics?.angles ?? []} />
        </>
      )}

      <DrilldownDialog drilldown={drilldown} onOpenChange={(open) => { if (!open) setDrilldown(null); }} />
    </section>
  );
}

type FiltersProps = {
  caller: { id: string; name: string };
  source: string;
  campaign: string;
  from: string;
  to: string;
  invalidInterval: boolean;
  callers: readonly { id: string; name: string }[];
  sources: readonly string[];
  campaigns: readonly string[];
  onCallerChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onCampaignChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

function Filters(props: FiltersProps) {
  return (
    <Card size="sm">
      <CardHeader className="pb-2"><CardTitle>Filtros</CardTitle></CardHeader>
      <CardContent className="grid gap-3 p-3 pt-0 sm:grid-cols-2 xl:grid-cols-5">
        <Field>
          <FieldLabel htmlFor="feedback-caller">Caller</FieldLabel>
          <Select value={props.caller.id} onValueChange={(value) => props.onCallerChange(value ?? "all")}>
            <SelectTrigger id="feedback-caller" className="h-9"><SelectValue>{props.caller.name}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">Todos los callers</SelectItem>{props.callers.map((caller) => <SelectItem key={caller.id} value={caller.id}>{caller.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="feedback-source">Origen</FieldLabel>
          <Select value={props.source} onValueChange={(value) => props.onSourceChange(value ?? "all")}>
            <SelectTrigger id="feedback-source" className="h-9"><SelectValue>{props.source === "all" ? "Todos los orígenes" : props.source}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">Todos los orígenes</SelectItem>{props.sources.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="feedback-campaign">Campaña</FieldLabel>
          <Select value={props.campaign} onValueChange={(value) => props.onCampaignChange(value ?? "all")}>
            <SelectTrigger id="feedback-campaign" className="h-9"><SelectValue>{props.campaign === "all" ? "Todas las campañas" : props.campaign}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">Todas las campañas</SelectItem>{props.campaigns.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel htmlFor="feedback-from">Desde</FieldLabel><Input className="h-9" id="feedback-from" type="date" value={props.from} onChange={(event) => props.onFromChange(event.target.value)} /></Field>
        <Field invalid={props.invalidInterval}><FieldLabel htmlFor="feedback-to">Hasta</FieldLabel><Input className="h-9" id="feedback-to" type="date" value={props.to} onChange={(event) => props.onToChange(event.target.value)} aria-invalid={props.invalidInterval} /><FieldError>{props.invalidInterval ? "La fecha final no puede ser anterior a la inicial" : ""}</FieldError></Field>
      </CardContent>
    </Card>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{value}</CardContent></Card>;
}

type Quality = { count: number; percentage: number };
type QualityField = "profile" | "source" | "campaign" | "outcome";

function DataQualityPanel({ quality, onSelect }: {
  quality?: { missingProfile: Quality; missingSource: Quality; missingCampaign: Quality; missingOutcome: Quality };
  onSelect: (field: QualityField, label: string) => void;
}) {
  const items: Array<{ field: QualityField; label: string; value: Quality }> = [
    { field: "profile", label: "Perfil", value: quality?.missingProfile ?? { count: 0, percentage: 0 } },
    { field: "source", label: "Origen", value: quality?.missingSource ?? { count: 0, percentage: 0 } },
    { field: "campaign", label: "Campaña", value: quality?.missingCampaign ?? { count: 0, percentage: 0 } },
    { field: "outcome", label: "Resultado", value: quality?.missingOutcome ?? { count: 0, percentage: 0 } },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Calidad del dato</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Button key={item.field} variant="outline" className="h-auto justify-between p-4 text-left" onClick={() => onSelect(item.field, item.label)}>
            <span><span className="block font-medium">Sin {item.label.toLowerCase()}</span><span className="text-xs text-muted-foreground">Ver feedbacks afectados</span></span>
            <span className="text-right"><span className="block text-xl font-semibold">{item.value.count}</span><span className="text-xs text-muted-foreground">{item.value.percentage}%</span></span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

type FunnelStage = { count: number; previousConversion: number; leads: FunnelLead[] };
type FunnelGroup = {
  value: string;
  totalConversion: number;
  stages: { received: FunnelStage; contacted: FunnelStage; appointment: FunnelStage; show: FunnelStage; sale: FunnelStage };
};

function FunnelSection({ title, groups, onSelect }: { title: string; groups: readonly FunnelGroup[]; onSelect: (title: string, leads: FunnelLead[]) => void }) {
  const columns: Array<{ key: keyof FunnelGroup["stages"]; label: string }> = [
    { key: "received", label: "Recibidos" }, { key: "contacted", label: "Contactados" },
    { key: "appointment", label: "Agenda" }, { key: "show", label: "Asistencia" }, { key: "sale", label: "Venta" },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="max-h-96 overflow-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Valor</TableHead>{columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}<TableHead>Conversión total</TableHead></TableRow></TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.value}>
                <TableCell className="font-medium">{group.value}</TableCell>
                {columns.map((column) => {
                  const stage = group.stages[column.key];
                  return <TableCell key={column.key}><Button variant="ghost" size="sm" onClick={() => onSelect(`${title}: ${group.value} · ${column.label}`, stage.leads)}>{stage.count} <span className="text-muted-foreground">({stage.previousConversion}%)</span></Button></TableCell>;
                })}
                <TableCell className="font-semibold">{group.totalConversion}%</TableCell>
              </TableRow>
            ))}
            {groups.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin datos suficientes para construir el embudo.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type AttributionRow = { value: string; total: number; appointmentRate: number; reactions: { appointment: number; not_interested: number } };

function AttributionTable({ title, rows, onSelect }: { title: string; rows: readonly AttributionRow[]; onSelect: (value: string) => void }) {
  return (
    <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="max-h-96 overflow-auto"><Table>
      <TableHeader><TableRow><TableHead>Valor</TableHead><TableHead>Total</TableHead><TableHead>Agenda</TableHead><TableHead>Conversión</TableHead><TableHead>No interesado</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row) => <TableRow key={row.value} className="cursor-pointer" onClick={() => onSelect(row.value)}><TableCell className="font-medium">{row.value}</TableCell><TableCell>{row.total}</TableCell><TableCell>{row.reactions.appointment}</TableCell><TableCell>{row.appointmentRate}%</TableCell><TableCell>{row.reactions.not_interested}</TableCell></TableRow>)}{rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin datos de atribución.</TableCell></TableRow>}</TableBody>
    </Table></CardContent></Card>
  );
}

function DonutChart({ title, data, onSelect }: { title: string; data: readonly FeedbackChartItem[]; onSelect?: (item: FeedbackChartItem) => void }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
      {total === 0 ? <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para mostrar</div> : <>
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-52"><PieChart><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} /><Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={2} strokeWidth={2} onClick={(_, index) => { const item = data[index]; if (item) onSelect?.(item); }}>{data.map((item, index) => <Cell key={item.key} className={onSelect ? "cursor-pointer" : undefined} fill={chartColors[index % chartColors.length]} />)}</Pie></PieChart></ChartContainer>
        <div className="flex flex-col gap-2">{data.map((item, index) => <button type="button" key={item.key} className="flex items-start justify-between gap-3 text-left text-sm" onClick={() => onSelect?.(item)}><span className="flex min-w-0 items-start gap-2"><span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span>{item.name}</span></span><span className="shrink-0 font-medium">{item.value} · {Math.round((item.value / total) * 100)}%</span></button>)}</div>
      </>}
    </CardContent></Card>
  );
}

function ProfileTable({ profiles }: { profiles: ReadonlyArray<{ profile: string; total: number; subProfiles: Array<{ profile: string; total: number }>; reactions: { appointment: number; future_call: number; not_interested: number; not_fit: number } }> }) {
  return <Card><CardHeader><CardTitle>Reacción por perfil</CardTitle></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Perfil</TableHead><TableHead>Subperfiles</TableHead><TableHead>Total</TableHead><TableHead>Agenda</TableHead><TableHead>Futuro</TableHead><TableHead>No interesado</TableHead><TableHead>No encaja</TableHead></TableRow></TableHeader><TableBody>{profiles.map((profile) => <TableRow key={profile.profile}><TableCell className="font-medium">{profileLabels[profile.profile] ?? profile.profile}</TableCell><TableCell>{profile.subProfiles.map((sub) => `${profileLabels[sub.profile] ?? sub.profile} (${sub.total})`).join(", ") || "—"}</TableCell><TableCell>{profile.total}</TableCell><TableCell>{profile.reactions.appointment}</TableCell><TableCell>{profile.reactions.future_call}</TableCell><TableCell>{profile.reactions.not_interested}</TableCell><TableCell>{profile.reactions.not_fit}</TableCell></TableRow>)}{profiles.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No hay feedbacks clasificados en este intervalo.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>;
}

function AngleTable({ angles }: { angles: ReadonlyArray<{ angle: string; total: number; reactions: { appointment: number; future_call: number; not_interested: number; not_fit: number } }> }) {
  return <Card><CardHeader><CardTitle>Ángulos de motivación</CardTitle></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Ángulo</TableHead><TableHead>Total</TableHead><TableHead>Agenda</TableHead><TableHead>Futuro</TableHead><TableHead>No interesado</TableHead><TableHead>No encaja</TableHead></TableRow></TableHeader><TableBody>{angles.map((angle) => <TableRow key={angle.angle}><TableCell className="font-medium">{angleLabels[angle.angle] ?? angle.angle}</TableCell><TableCell>{angle.total}</TableCell><TableCell>{angle.reactions.appointment}</TableCell><TableCell>{angle.reactions.future_call}</TableCell><TableCell>{angle.reactions.not_interested}</TableCell><TableCell>{angle.reactions.not_fit}</TableCell></TableRow>)}{angles.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No hay ángulos registrados en este intervalo.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>;
}

function DrilldownDialog({ drilldown, onOpenChange }: { drilldown: Drilldown; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={Boolean(drilldown)} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{drilldown?.title ?? "Detalle"}</DialogTitle><DialogDescription>{drilldown?.items.length ?? 0} leads encontrados. Cada fila explica qué registros forman el dato seleccionado.</DialogDescription></DialogHeader><Table><TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Origen</TableHead><TableHead>Campaña</TableHead><TableHead>Resultado</TableHead><TableHead>Perfil</TableHead><TableHead>Resumen</TableHead></TableRow></TableHeader><TableBody>{drilldown?.items.map((item) => {
    if ("leadId" in item) {
      return <TableRow key={`${item.leadId}:${String(item.occurredAt)}`}><TableCell className="font-medium">{item.leadName}</TableCell><TableCell>{item.source ?? "—"}</TableCell><TableCell>{item.campaign ?? "—"}</TableCell><TableCell>{item.outcome ?? "—"}</TableCell><TableCell>{item.profile ? (profileLabels[item.profile] ?? item.profile) : "—"}</TableCell><TableCell className="max-w-sm whitespace-normal">{item.summary || "—"}</TableCell></TableRow>;
    }

    return <TableRow key={item.id}><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.source ?? "—"}</TableCell><TableCell>{item.campaign ?? "—"}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell></TableRow>;
  })}{drilldown?.items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No hay registros para este segmento.</TableCell></TableRow>}</TableBody></Table></DialogContent></Dialog>;
}
