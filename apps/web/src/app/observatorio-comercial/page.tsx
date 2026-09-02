"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@crm-fran/ui/components/chart";
import { Empty } from "@crm-fran/ui/components/empty";
import { Input } from "@crm-fran/ui/components/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { commercialUiLabel } from "@/lib/commercial-ui-labels";
import { resolveAdminPageAccess } from "@/lib/admin-page-access";
import { trpc } from "@/utils/trpc";

const madridDay = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const shiftCalendarDay = (day: string, offset: number) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + offset)).toISOString().slice(0, 10);
};

const initialTo = () => madridDay();
const initialFrom = () => shiftCalendarDay(madridDay(), -90);
const percent = (basisPoints: number | null) => basisPoints === null ? "—" : `${(basisPoints / 100).toFixed(1)}%`;
const money = (cents: number, currency: string) => new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
const dateLabel = (value: string | Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium" }).format(value instanceof Date ? value : new Date(value));
const inclusiveEndLabel = (value: string | Date) => {
  const exclusiveEnd = value instanceof Date ? value : new Date(value);
  return dateLabel(new Date(exclusiveEnd.getTime() - 1));
};

function Information({ title, label = `Información sobre ${title}`, children }: { title: string; label?: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="size-11" aria-label={label} />}>
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="dashboard-arc-theme" align="start">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function SectionTitle({ title, description, informationLabel }: { title: string; description: string; informationLabel?: string }) {
  return <div className="flex items-center gap-1"><h2 className="text-xl font-semibold">{title}</h2><Information title={title} label={informationLabel}>{description}</Information></div>;
}

function HonestState({ state }: { state: "insufficient_evidence" | "currency_required" | "not_comparable" }) {
  if (state === "currency_required") return <Empty className="py-6" heading="Monedas no comparables" description="Hay varias monedas en el periodo. Se mantiene la evidencia económica separada y no se aplica FX implícito." />;
  if (state === "not_comparable") return <Empty className="py-6" heading="No comparable" description="No existe verdad económica comparable en una única moneda para este periodo." />;
  return <Empty className="py-6" heading="Evidencia insuficiente" description="La muestra no alcanza el mínimo visible de esta sección." />;
}

function Seasonality({ data }: { data: NonNullable<ReturnType<typeof useObservatory>["data"]>["seasonality"] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="Estacionalidad" description="Agrupa únicamente días y semanas cerrados en Europe/Madrid. Muestra mediana e IQR; describe patrones, no predice causas." />
      {data.status !== "available" ? <HonestState state={data.status} /> : (
        <>
          <Card size="sm" className="w-fit max-w-full" aria-label="Resumen de evidencia estacional"><CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3"><Badge variant="secondary">Evidencia disponible</Badge><span><strong>{data.observations}</strong> observaciones</span><span><strong>{data.sampleDays}</strong> días cerrados</span><span><strong>{data.sampleWeeks}</strong> semanas cerradas</span><span className="text-muted-foreground">{dateLabel(data.range.from)}–{inclusiveEndLabel(data.range.to)}</span></CardContent></Card>
          <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center gap-1">
                  <CardTitle>Volumen por semana cerrada</CardTitle>
                  <Information title="Metodología estacional" label="Información sobre metodología estacional">{`${data.minimum} ${data.rule}`}</Information>
                </div>
                <CardDescription>Leads observados en cada semana completa del periodo.</CardDescription>
              </CardHeader>
              <CardContent><ChartContainer role="img" aria-label="Volumen de leads por semana cerrada" config={{ volume: { label: "Leads", color: "var(--chart-1)" } }} className="h-40 w-full"><BarChart accessibilityLayer data={data.byWeek}><CartesianGrid vertical={false} /><XAxis dataKey="week" tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="volume" fill="var(--color-volume)" radius={4} /></BarChart></ChartContainer></CardContent>
            </Card>
            <Card size="sm"><CardHeader><CardTitle>Señales por día de la semana</CardTitle><CardDescription>Mediana e IQR sobre días cerrados; no son predicciones ni causas.</CardDescription></CardHeader><CardContent><div aria-label="Señales estacionales por día" className="grid gap-2 sm:grid-cols-2">{data.byWeekday.map((row) => <article className="rounded-md border bg-background p-3" key={row.weekday}><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-semibold">{row.label}</h3><Badge variant="outline">n={row.volume.sample}</Badge></div><dl className="grid grid-cols-3 gap-2"><div><dt className="text-muted-foreground">Volumen</dt><dd className="font-medium">{row.volume.median ?? "—"}</dd></div><div><dt className="text-muted-foreground">IQR</dt><dd className="font-medium">{row.volume.q1 ?? "—"}–{row.volume.q3 ?? "—"}</dd></div><div><dt className="text-muted-foreground">Conversión</dt><dd className="font-medium">{row.conversionBps.median === null ? "—" : percent(Math.round(row.conversionBps.median))}</dd></div></dl></article>)}</div></CardContent></Card>
          </div>
        </>
      )}
    </section>
  );
}

function Anomalies({ data }: { data: NonNullable<ReturnType<typeof useObservatory>["data"]>["anomalies"] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="Radar de anomalías" description="Compara el periodo con un periodo de referencia de igual duración estrictamente anterior. Volumen usa mediana y MAD; conversión usa Wilson 95%, muestra mínima y materialidad." />
      {data.status !== "available" ? <HonestState state={data.status} /> : null}
      <Card size="sm">
        <CardHeader><CardTitle>Señales deterministas</CardTitle><CardDescription>Actual {dateLabel(data.range.from)}–{inclusiveEndLabel(data.range.to)} · referencia {dateLabel(data.baseline.from)}–{inclusiveEndLabel(data.baseline.to)} · {data.rule}</CardDescription></CardHeader>
        <CardContent className="max-h-96 overflow-auto"><Table className="min-w-5xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Ámbito</TableHead><TableHead className="h-8">Métrica</TableHead><TableHead className="h-8">Estado</TableHead><TableHead className="h-8">Actual</TableHead><TableHead className="h-8">Referencia</TableHead><TableHead className="h-8">Leads</TableHead><TableHead className="h-8">Grupos temporales</TableHead><TableHead className="h-8">Regla</TableHead></TableRow></TableHeader><TableBody>{data.items.map((row) => <TableRow className="h-9" key={row.key}><TableCell className="px-2 py-1">{commercialUiLabel(row.scope)} · {row.label}</TableCell><TableCell className="px-2 py-1">{commercialUiLabel(row.metric)}</TableCell><TableCell className="px-2 py-1"><Badge variant={row.state === "anomaly" ? "destructive" : row.state === "within_expected_range" ? "secondary" : "outline"}>{commercialUiLabel(row.state)}</Badge></TableCell><TableCell className="px-2 py-1">{row.value === null ? "—" : row.metric === "conversion" ? `${(row.value * 100).toFixed(1)}%` : row.value.toFixed(2)}</TableCell><TableCell className="px-2 py-1">{row.baseline === null ? "—" : row.metric === "conversion" ? `${(row.baseline * 100).toFixed(1)}%` : row.baseline.toFixed(2)}</TableCell><TableCell className="px-2 py-1">{row.sample} / {row.baselineSample}</TableCell><TableCell className="px-2 py-1">{row.currentBucketCount} / {row.baselineBucketCount}</TableCell><TableCell className="max-w-80 whitespace-normal px-2 py-1 text-xs text-muted-foreground">{row.minimum} · {row.rule}</TableCell></TableRow>)}</TableBody></Table></CardContent>
      </Card>
    </section>
  );
}

function Bridge({ data, currency }: { data: NonNullable<ReturnType<typeof useObservatory>["data"]>["bridge"]; currency: string | null }) {
  const economic = data.economic;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="Puente explicativo" description="Separa aritméticamente el cambio comercial y económico. Cada puente cierra exactamente contra su delta; no atribuye causalidad." />
      <Card size="sm"><CardHeader><CardTitle>Lectura responsable</CardTitle><CardDescription>{data.note} Cada barra es una contribución aritmética. No implica causalidad.</CardDescription></CardHeader></Card>
      {data.commercial.status !== "available" ? <HonestState state={data.commercial.status} /> : <Card size="sm"><CardHeader><CardTitle>Puente comercial simétrico</CardTitle><CardDescription>{data.commercial.rule}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-sm text-muted-foreground">Delta de ventas</p><p className="text-2xl font-semibold">{data.commercial.deltaSales.toFixed(2)}</p></div><div><p className="text-sm text-muted-foreground">Contribución volumen</p><p>{data.commercial.volumeContribution.toFixed(2)}</p></div><div><p className="text-sm text-muted-foreground">Contribución conversión</p><p>{data.commercial.conversionContribution.toFixed(2)}</p></div><div><p className="text-sm text-muted-foreground">Muestra madura actual / referencia</p><p>{data.commercial.current.sample} / {data.commercial.baseline.sample}</p></div></CardContent></Card>}
      {economic.status !== "available" || !currency ? <HonestState state={economic.status === "available" ? "currency_required" : economic.status} /> : <Card size="sm"><CardHeader><CardTitle>Desglose del margen realizado</CardTitle><CardDescription>{economic.rule} · Moneda resuelta por el servidor: {currency}. Sin FX implícito.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex flex-wrap gap-2"><Badge variant="outline">Referencia {money(economic.baseline.marginCents, currency)}</Badge><Badge variant="outline">Actual {money(economic.current.marginCents, currency)}</Badge><Badge variant="secondary">Δ {money(economic.deltaMarginCents, currency)}</Badge></div><Table><TableHeader><TableRow><TableHead className="h-8">Contribución aritmética</TableHead><TableHead className="h-8">Importe</TableHead></TableRow></TableHeader><TableBody>{economic.contributions.map((row) => <TableRow className="h-9" key={row.key}><TableCell className="px-2 py-1">{row.label}</TableCell><TableCell className="px-2 py-1">{money(row.amountCents, currency)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    </section>
  );
}

const RISK_EXPLANATION = "Cada fila representa una dimensión de dependencia: fuente, campaña, caller, closer o perfil. Dentro de ella, cada nodo o grupo es el valor atribuido al lead al cierre de la evidencia; la relación expresa pertenencia y concentración, no influencia causal. Top 1 es la proporción de leads concentrada en el grupo principal y Top 3 suma los tres grupos con más leads. HHI suma el cuadrado de todas las cuotas: crece cuando el volumen depende de pocos grupos y contempla toda la distribución. El nivel es alto con Top 1 ≥ 60% o HHI ≥ 0,35; medio con Top 1 ≥ 40% o HHI ≥ 0,20; bajo en otro caso. La exposición absoluta suma el valor absoluto de los márgenes en una única moneda resuelta por el servidor; el margen negativo absoluto solo acumula pérdidas y no las compensa con resultados positivos. Las fuentes son asignaciones, actividad del lead, hechos confirmados y ledger económico cerrados dentro del periodo. Sin atribución identifica datos incompletos y ventas sin registro económico señala cobertura insuficiente. Es un mapa descriptivo, sensible al tamaño y calidad de la muestra: ayuda a localizar concentración y fragilidad, pero no demuestra causalidad ni recomienda redistribuir leads por sí solo.";

function Risk({ data }: { data: NonNullable<ReturnType<typeof useObservatory>["data"]>["risk"] }) {
  const currency = data.currency;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="Mapa de dependencia y riesgo" informationLabel="Información detallada sobre el mapa de dependencia y riesgo" description={RISK_EXPLANATION} />
      {data.status !== "available" ? <HonestState state={data.status} /> : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Card size="sm"><CardHeader><CardTitle>Cobertura</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Leads</p><p>n={data.coverage.sample}</p></div><div><p className="text-xs text-muted-foreground">Sin atribución</p><p>{data.coverage.withoutAttribution}</p></div><div><p className="text-xs text-muted-foreground">Ventas sin registro económico</p><p>{data.coverage.salesWithoutLedger === null ? "No evaluable sin moneda" : data.coverage.salesWithoutLedger}</p></div></CardContent></Card>
            <Card size="sm"><CardHeader><CardTitle>Lectura y umbrales</CardTitle></CardHeader><CardContent className="flex flex-col gap-1"><p>Alto: Top 1 ≥60% o HHI ≥0,35</p><p>Medio: Top 1 ≥40% o HHI ≥0,20</p><p className="text-muted-foreground">{currency ? `Evidencia económica en ${currency}` : "Varias monedas: exposición económica no comparable"} · Sin FX implícito</p></CardContent></Card>
          </div>
          <Card size="sm">
            <CardHeader><CardTitle>Concentración por dimensión</CardTitle><CardDescription>{dateLabel(data.range.from)}–{inclusiveEndLabel(data.range.to)} · {data.rule}</CardDescription></CardHeader>
            <CardContent className="max-h-96 overflow-auto"><Table className="min-w-5xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Dimensión</TableHead><TableHead className="h-8">Riesgo</TableHead><TableHead className="h-8">Grupo principal</TableHead><TableHead className="h-8">Top 1</TableHead><TableHead className="h-8">Top 3</TableHead><TableHead className="h-8">HHI</TableHead><TableHead className="h-8">Grupos</TableHead><TableHead className="h-8">Exposición absoluta</TableHead><TableHead className="h-8">Margen negativo absoluto</TableHead></TableRow></TableHeader><TableBody>{data.dimensions.map((row) => <TableRow className="h-9" key={row.dimension}><TableCell className="px-2 py-1">{commercialUiLabel(row.dimension)}</TableCell><TableCell className="px-2 py-1"><Badge variant={row.level === "high" ? "destructive" : row.level === "medium" ? "secondary" : "outline"}>{commercialUiLabel(row.level)}</Badge></TableCell><TableCell className="px-2 py-1">{row.groups[0]?.key ?? "Sin grupos"}</TableCell><TableCell className="px-2 py-1">{percent(row.top1Bps)}</TableCell><TableCell className="px-2 py-1">{percent(row.top3Bps)}</TableCell><TableCell className="px-2 py-1">{row.hhi.toFixed(3)}</TableCell><TableCell className="px-2 py-1">{row.groups.length} · n={row.sample}</TableCell><TableCell className="px-2 py-1">{currency ? money(row.absoluteExposureCents, currency) : "—"}</TableCell><TableCell className="px-2 py-1">{currency ? money(row.negativeMarginExposureCents, currency) : "—"}</TableCell></TableRow>)}</TableBody></Table></CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function useObservatory(from: string, to: string, enabled: boolean) {
  return useQuery({ ...trpc.commercialObservatory.overview.queryOptions({ from, to }), enabled });
}

export default function CommercialObservatoryPage() {
  const permissionState = usePermissionState();
  const adminAccess = resolveAdminPageAccess(permissionState);
  const isAdmin = adminAccess === "granted";
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const query = useObservatory(from, to, isAdmin);

  if (adminAccess === "loading") return <section className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Comprobando permisos…</p><Skeleton className="h-64 w-full" /></section>;
  if (adminAccess === "error") return <section><Empty heading="No se pudieron comprobar los permisos" description="No se asume que el acceso esté denegado. Revisa la conexión y vuelve a intentarlo." /></section>;
  if (adminAccess === "denied") return <section><Empty heading="Acceso restringido" description="El Observatorio comercial solo está disponible para administración." /></section>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <h2 className="text-xl font-semibold">Lectura del periodo</h2>
        <Information title="Observatorio comercial">Instantánea controlada por el servidor, determinista y de solo lectura. No muestra leads, no crea alertas y no ejecuta decisiones operativas.</Information>
      </div>
      <Card size="sm" className="w-fit max-w-full">
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
          <div className="flex min-h-8 items-center gap-1 self-start sm:self-end"><span className="text-sm font-semibold">Periodo</span><Information title="Periodo">Usa días cerrados en Europe/Madrid; la fecha final no puede estar en el futuro.</Information></div>
          <label className="flex flex-col gap-1 text-xs" htmlFor="observatory-from">Desde<Input id="observatory-from" className="h-7 w-36 px-2" aria-label="Desde" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs" htmlFor="observatory-to">Hasta<Input id="observatory-to" className="h-7 w-36 px-2" aria-label="Hasta" type="date" value={to} min={from} max={initialTo()} onChange={(event) => setTo(event.target.value)} /></label>
        </CardContent>
      </Card>

      {query.isPending ? <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Cargando observatorio…</p><Skeleton className="h-56 w-full" /><Skeleton className="h-40 w-full" /></div> : query.isError ? <Empty heading="No se pudo cargar" description="No se muestran cálculos parciales; revisa el rango y vuelve a intentarlo." /> : query.data.coverage.observations === 0 ? <Empty heading="Sin observaciones" description="No hay observaciones controladas por el servidor dentro del histórico disponible." /> : (
        <>
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{query.data.policyVersion}</Badge><Badge variant="outline">Europe/Madrid</Badge><Badge variant="secondary">{query.data.coverage.observations} leads únicos</Badge>{query.data.resolvedCurrency ? <Badge variant="outline">Moneda única: {query.data.resolvedCurrency}</Badge> : query.data.currencies.length > 1 ? <Badge variant="outline">{query.data.currencies.length} monedas separadas</Badge> : null}{query.data.coverage.duplicateObservationsExcluded > 0 ? <Badge variant="outline">{query.data.coverage.duplicateObservationsExcluded} duplicados excluidos</Badge> : null}</div>
          <Tabs defaultValue="seasonality">
            <TabsList className="h-auto w-fit max-w-full flex-nowrap justify-start gap-1 rounded-lg border bg-muted/40 p-1" aria-label="Análisis del observatorio"><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="seasonality">Estacionalidad</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="anomalies">Radar de anomalías</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="bridge">Puente explicativo</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="risk">Mapa de riesgo</TabsTrigger></TabsList>
            <TabsContent value="seasonality"><Seasonality data={query.data.seasonality} /></TabsContent>
            <TabsContent value="anomalies"><Anomalies data={query.data.anomalies} /></TabsContent>
            <TabsContent value="bridge"><Bridge data={query.data.bridge} currency={query.data.resolvedCurrency} /></TabsContent>
            <TabsContent value="risk"><Risk data={query.data.risk} /></TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}
