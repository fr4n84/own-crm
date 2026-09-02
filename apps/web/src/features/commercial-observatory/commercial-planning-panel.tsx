"use client";

import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { InfoIcon } from "lucide-react";

import type { AppRouter } from "@crm-fran/api/routers/index";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { resolveAdminPageAccess } from "@/lib/admin-page-access";
import { commercialUiLabel } from "@/lib/commercial-ui-labels";
import { trpc } from "@/utils/trpc";

type PlanningData = inferRouterOutputs<AppRouter>["commercialPlanning"]["overview"];
type Inputs = {
  leadVolumePerDay: number;
  appointmentRatePercent: number;
  saleRatePercent: number;
  collectionPerSaleEuros: number;
  refundPerSaleEuros: number;
  directCostPerSaleEuros: number;
  adSpendPerDayEuros: number;
  seasonalityEnabled: boolean;
  seasonalityPercent: number;
  availableCallers: number;
  callerCapacityPerDay: number;
  availableClosers: number;
  closerCapacityPerDay: number;
  targetUtilizationPercent: number;
  fixedPerSaleEuros: number;
  collectionsPercent: number;
  callerSharePercent: number;
  goalSales: number;
  goalBonusEuros: number;
  stretchSales: number;
  stretchBonusEuros: number;
};

const initialInputs: Inputs = {
  leadVolumePerDay: 10, appointmentRatePercent: 40, saleRatePercent: 10,
  collectionPerSaleEuros: 2_000, refundPerSaleEuros: 0, directCostPerSaleEuros: 0, adSpendPerDayEuros: 0,
  seasonalityEnabled: false, seasonalityPercent: 100,
  availableCallers: 1, callerCapacityPerDay: 20, availableClosers: 1, closerCapacityPerDay: 8, targetUtilizationPercent: 85,
  fixedPerSaleEuros: 0, collectionsPercent: 0, callerSharePercent: 40,
  goalSales: 20, goalBonusEuros: 0, stretchSales: 40, stretchBonusEuros: 0,
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
const percent = (bps: number | null) => bps === null ? "—" : `${(bps / 100).toFixed(1)}%`;

function scenarioInput(inputs: Inputs) {
  return {
    leadVolumePerDay: inputs.leadVolumePerDay,
    appointmentRateBps: Math.round(inputs.appointmentRatePercent * 100),
    saleRateBps: Math.round(inputs.saleRatePercent * 100),
    collectionPerSaleCents: Math.round(inputs.collectionPerSaleEuros * 100),
    refundPerSaleCents: Math.round(inputs.refundPerSaleEuros * 100),
    directCostPerSaleCents: Math.round(inputs.directCostPerSaleEuros * 100),
    adSpendPerDayCents: Math.round(inputs.adSpendPerDayEuros * 100),
    seasonalityEnabled: inputs.seasonalityEnabled,
    seasonalityFactorBps: Math.round(inputs.seasonalityPercent * 100),
    capacity: {
      availableCallers: inputs.availableCallers,
      callerCapacityPerDay: inputs.callerCapacityPerDay,
      availableClosers: inputs.availableClosers,
      closerCapacityPerDay: inputs.closerCapacityPerDay,
      targetUtilizationBps: Math.round(inputs.targetUtilizationPercent * 100),
    },
    commission: {
      fixedPerSaleCents: Math.round(inputs.fixedPerSaleEuros * 100),
      collectionsPercentBps: Math.round(inputs.collectionsPercent * 100),
      callerShareBps: Math.round(inputs.callerSharePercent * 100),
      goalSales: inputs.goalSales,
      goalBonusCents: Math.round(inputs.goalBonusEuros * 100),
      stretchSales: inputs.stretchSales,
      stretchBonusCents: Math.round(inputs.stretchBonusEuros * 100),
    },
  };
}

function Information({ title, children }: { title: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="size-11" aria-label={`Información sobre ${title}`} />}>
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent><PopoverHeader><PopoverTitle>{title}</PopoverTitle><PopoverDescription>{children}</PopoverDescription></PopoverHeader></PopoverContent>
    </Popover>
  );
}

function NumericField({ id, label, value, onChange, min = 0, max }: {
  id: string; label: string; value: number; onChange: (value: number) => void; min?: number; max?: number;
}) {
  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs" htmlFor={id}>{label}</FieldLabel>
      <Input className="h-8" id={id} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

function AssumptionCards({ data }: { data: Record<string, { value: number | boolean | null; origin: "observed" | "introduced" | "policy_default" }> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(data).map(([key, item]) => (
        <Card key={key} size="sm">
          <CardHeader className="gap-1"><CardTitle className="text-sm">{commercialUiLabel(key)}</CardTitle><Badge variant="outline">{commercialUiLabel(item.origin)}</Badge></CardHeader>
          <CardContent className="text-sm">{item.value === null ? "Evidencia insuficiente" : typeof item.value === "boolean" ? item.value ? "Sí" : "No" : item.value}</CardContent>
        </Card>
      ))}
    </div>
  );
}

function Forecast({ data, currency }: { data: PlanningData; currency: string }) {
  if (data.scenario.status !== "available") return <Empty heading="Evidencia insuficiente" description={`Faltan supuestos efectivos para cerrar la simulación en ${currency}.`} />;
  return (
    <Card size="sm">
      <CardHeader className="gap-0.5"><div className="flex items-center justify-between gap-2"><CardTitle>Escenario en {currency}</CardTitle><Badge variant="outline">{currency}</Badge></div><CardDescription>{data.notice}</CardDescription></CardHeader>
      <CardContent className="max-h-72 overflow-auto p-0" tabIndex={0} aria-label={`Proyección en ${currency}`}>
        <div className="overflow-x-auto"><Table className="min-w-4xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Días</TableHead><TableHead className="h-8">Leads</TableHead><TableHead className="h-8">Agendas</TableHead><TableHead className="h-8">Ventas</TableHead><TableHead className="h-8">Cobros</TableHead><TableHead className="h-8">Comisiones</TableHead><TableHead className="h-8">Gasto</TableHead><TableHead className="h-8">Margen</TableHead><TableHead className="h-8">Δ margen</TableHead></TableRow></TableHeader><TableBody>{data.scenario.forecast.map((row) => <TableRow className="h-9" key={row.days}><TableCell className="py-1">{row.days}</TableCell><TableCell className="py-1">{row.leads}</TableCell><TableCell className="py-1">{row.appointments}</TableCell><TableCell className="py-1">{row.sales}</TableCell><TableCell className="py-1">{money(row.collectionsCents, currency)}</TableCell><TableCell className="py-1">{money(row.commissionsCents, currency)}</TableCell><TableCell className="py-1">{money(row.adSpendCents, currency)}</TableCell><TableCell className="py-1">{money(row.marginBeforeUnmodeledCostsCents, currency)}</TableCell><TableCell className="py-1">{row.delta.marginBeforeUnmodeledCostsCents === null ? "Base insuficiente" : money(row.delta.marginBeforeUnmodeledCostsCents, currency)}</TableCell></TableRow>)}</TableBody></Table></div>
      </CardContent>
    </Card>
  );
}

function Capacity({ data }: { data: PlanningData }) {
  if (data.scenario.capacity.some((row) => row.status !== "available")) return <Empty heading="Capacidad insuficiente" description="Introduce disponibilidad real mayor o igual que cero, capacidad por persona mayor que cero y un umbral de utilización válido." />;
  return (
    <Card size="sm"><CardHeader className="gap-0.5"><CardTitle>Utilización, déficit y exceso</CardTitle><CardDescription>Callers por leads y closers por agendas; no crea usuarios ni asigna leads.</CardDescription></CardHeader><CardContent className="max-h-72 overflow-auto p-0" tabIndex={0} aria-label="Capacidad por horizonte"><div className="overflow-x-auto"><Table className="min-w-3xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Días</TableHead><TableHead className="h-8">Rol</TableHead><TableHead className="h-8">Demanda</TableHead><TableHead className="h-8">Capacidad</TableHead><TableHead className="h-8">Utilización</TableHead><TableHead className="h-8">Déficit</TableHead><TableHead className="h-8">Exceso</TableHead><TableHead className="h-8">Contratación</TableHead></TableRow></TableHeader><TableBody>{data.scenario.capacity.flatMap((row) => row.status !== "available" || !row.callers || !row.closers ? [] : [["Callers", row.callers] as const, ["Closers", row.closers] as const].map(([role, item]) => <TableRow className="h-9" key={`${row.days}-${role}`}><TableCell className="py-1">{row.days}</TableCell><TableCell className="py-1">{role}</TableCell><TableCell className="py-1">{item.demand}</TableCell><TableCell className="py-1">{item.effectiveCapacity}</TableCell><TableCell className="py-1">{percent(item.utilizationBps)}</TableCell><TableCell className="py-1">{item.deficitUnits}</TableCell><TableCell className="py-1">{item.excessUnits}</TableCell><TableCell className="py-1">{item.hiresSuggested}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
  );
}

function Commission({ data, currency }: { data: PlanningData; currency: string }) {
  return (
    <div className="flex flex-col gap-3">
      {data.scenario.forecast[0] ? <AssumptionCards data={data.scenario.forecast[0].commission.assumptions} /> : null}
      <Card size="sm"><CardHeader className="gap-0.5"><div className="flex items-center justify-between gap-2"><CardTitle>Agregado por rol</CardTitle><Badge variant="outline">{currency}</Badge></div><CardDescription>No ejecuta pagos ni mutaciones del registro económico.</CardDescription></CardHeader><CardContent className="max-h-72 overflow-auto p-0" tabIndex={0} aria-label={`Comisiones en ${currency}`}><div className="overflow-x-auto"><Table className="min-w-2xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Días</TableHead><TableHead className="h-8">Tramo</TableHead><TableHead className="h-8">Total</TableHead><TableHead className="h-8">Callers</TableHead><TableHead className="h-8">Closers</TableHead></TableRow></TableHeader><TableBody>{data.scenario.forecast.map((row) => <TableRow className="h-9" key={row.days}><TableCell className="py-1">{row.days}</TableCell><TableCell className="py-1">{commercialUiLabel(row.commission.bonusTier)}</TableCell><TableCell className="py-1">{money(row.commissionsCents, currency)}</TableCell><TableCell className="py-1">{row.commission.callersCents === null ? "Supuesto requerido" : money(row.commission.callersCents, currency)}</TableCell><TableCell className="py-1">{row.commission.closersCents === null ? "Supuesto requerido" : money(row.commission.closersCents, currency)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    </div>
  );
}

export function CommercialPlanningPanel() {
  const permissionState = usePermissionState();
  const adminAccess = resolveAdminPageAccess(permissionState);
  const isAdmin = adminAccess === "granted";
  const [inputs, setInputs] = useState(initialInputs);
  const update = <K extends keyof Inputs>(key: K, value: Inputs[K]) => setInputs((current) => ({ ...current, [key]: value }));
  const scenario = scenarioInput(inputs);
  const discovery = useQuery({
    ...trpc.commercialPlanning.overview.queryOptions({ horizons: [30, 60, 90], scenario }),
    enabled: isAdmin,
  });
  const availableCurrencies = discovery.data?.availableCurrencies ?? [];
  const currencyQueries = useQueries({
    queries: availableCurrencies.map((currency) => ({
      ...trpc.commercialPlanning.overview.queryOptions({ currency, horizons: [30, 60, 90], scenario }),
      enabled: isAdmin,
    })),
  });

  if (adminAccess === "loading") return <section className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Comprobando permisos…</p><Skeleton className="h-48 w-full" /></section>;
  if (adminAccess === "error") return <Empty heading="No se pudieron comprobar los permisos" description="No se asume que el acceso esté denegado. Revisa la conexión y vuelve a intentarlo." />;
  if (adminAccess === "denied") return <Empty heading="Acceso restringido" description="La Planificación comercial solo está disponible para administración global." />;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="commercial-planning-title">
      <div>
        <div className="flex items-center gap-1"><h2 id="commercial-planning-title" className="text-xl font-semibold">Planificación comercial</h2><Information title="Planificación comercial">Instantánea controlada por el servidor del último día cerrado en Europe/Madrid. Compara Base observada con un Escenario editable, sin crear usuarios, asignar leads ni ejecutar pagos.</Information></div>
        <p className="text-sm text-muted-foreground">Proyección 30/60/90, capacidad, contratación y comisiones sobre los mismos supuestos efectivos.</p>
      </div>

      <Card size="sm" aria-label="Escenario editable">
        <CardHeader className="gap-0.5"><CardTitle>Escenario editable</CardTitle><CardDescription>Simulación condicionada. No es una predicción y muestra margen antes de Costes no modelados. Todos los valores son introducidos y permanecen separados de la Base observada. Cada moneda se simula y presenta por separado con el mismo valor nominal introducido. No se aplica FX ni se agregan importes entre monedas.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-2 md:grid-cols-2">
            <NumericField id="lead-volume" label="Leads por día" value={inputs.leadVolumePerDay} onChange={(value) => update("leadVolumePerDay", value)} />
            <NumericField id="appointment-rate" label="Tasa de agendas (%)" max={100} value={inputs.appointmentRatePercent} onChange={(value) => update("appointmentRatePercent", value)} />
            <NumericField id="sale-rate" label="Tasa de venta (%)" max={100} value={inputs.saleRatePercent} onChange={(value) => update("saleRatePercent", value)} />
            <NumericField id="seasonality" label="Factor estacional (%)" min={10} max={300} value={inputs.seasonalityPercent} onChange={(value) => update("seasonalityPercent", value)} />
            <label className="flex min-h-11 items-center gap-2 text-xs md:col-span-2"><Checkbox checked={inputs.seasonalityEnabled} onCheckedChange={(checked) => update("seasonalityEnabled", checked)} />Aplicar estacionalidad introducida</label>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <NumericField id="collection" label="Cobro por venta (unidad monetaria)" value={inputs.collectionPerSaleEuros} onChange={(value) => update("collectionPerSaleEuros", value)} />
            <NumericField id="refund" label="Reembolso por venta (unidad monetaria)" value={inputs.refundPerSaleEuros} onChange={(value) => update("refundPerSaleEuros", value)} />
            <NumericField id="direct-cost" label="Coste directo por venta (unidad monetaria)" value={inputs.directCostPerSaleEuros} onChange={(value) => update("directCostPerSaleEuros", value)} />
            <NumericField id="ad-spend" label="Gasto publicitario diario (unidad monetaria)" value={inputs.adSpendPerDayEuros} onChange={(value) => update("adSpendPerDayEuros", value)} />
          </div>
        </CardContent>
      </Card>

      {discovery.isPending ? <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Cargando planificación…</p><Skeleton className="h-48 w-full" /></div>
        : discovery.isError ? <Empty heading="No se pudo cargar" description="No se muestran cálculos parciales. Revisa los supuestos acotados." />
        : discovery.data.coverage.observations === 0 ? <Empty heading="Sin observaciones" description="No hay observaciones controladas por el servidor; la Base observada seguirá insuficiente." />
        : <>
          <div className="flex flex-wrap items-center gap-2" aria-label="Cobertura de planificación"><Badge variant="outline">{discovery.data.policyVersion}</Badge><Badge variant="outline">Europe/Madrid</Badge><Badge variant="secondary">Cierre {discovery.data.snapshot.day}</Badge><Badge variant="outline">{discovery.data.coverage.observations} leads únicos</Badge>{availableCurrencies.map((currency) => <Badge key={currency} variant="outline">{currency}</Badge>)}<Information title="Separación monetaria">Cada moneda mantiene su cohorte, sus denominadores y sus importes. El escenario nominal se evalúa independientemente en cada bloque; no existe suma, conversión ni FX implícito.</Information></div>
          {availableCurrencies.length === 0 ? <Empty heading="Evidencia insuficiente" description="No hay verdad económica con moneda registrada. No se elegirá una moneda ni se mostrarán importes sin unidad." /> : null}
          <Tabs defaultValue="forecast">
            <TabsList className="h-auto w-fit max-w-full flex-nowrap justify-start gap-1 rounded-lg border bg-muted/40 p-1"><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="forecast">Proyección 30/60/90</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="capacity">Capacidad y contratación</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="commission">Comisiones e incentivos</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="assumptions">Base observada</TabsTrigger></TabsList>
            <TabsContent value="forecast" className="flex flex-col gap-3">
              <div className="flex items-center gap-1"><h3 className="font-semibold">Proyección 30/60/90</h3><Information title="Proyección 30/60/90">La fórmula cierra en cada moneda: cobros − reembolsos − costes directos − comisiones − gasto. Los deltas comparan solo contra la Base observada de esa moneda.</Information></div>
              {availableCurrencies.map((currency, index) => {
                const query = currencyQueries[index];
                return !query || query.isPending ? <Skeleton key={currency} className="h-40 w-full" /> : query.isError ? <Empty key={currency} heading={`No se pudo calcular en ${currency}`} description="No se muestran resultados parciales." /> : <div key={currency} className="flex flex-col gap-2"><Forecast data={query.data} currency={currency} /><Card size="sm"><CardHeader className="gap-0.5"><CardTitle>Sensibilidad 90 días · {currency}</CardTitle><CardDescription>Desfavorable, base y favorable alteran volumen y tasa de venta ±20%; no es un intervalo de confianza.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{query.data.scenario.sensitivity.map((row) => <Badge key={row.key} variant="outline">{commercialUiLabel(row.key)}: {row.sales ?? "—"} ventas · {row.marginBeforeUnmodeledCostsCents === null ? "—" : money(row.marginBeforeUnmodeledCostsCents, currency)}</Badge>)}</CardContent></Card></div>;
              })}
            </TabsContent>
            <TabsContent value="capacity" className="flex flex-col gap-3">
              <div className="flex items-center gap-1"><h3 className="font-semibold">Capacidad y contratación</h3><Information title="Capacidad y contratación">Callers se dimensionan por leads y closers por agendas. La capacidad no depende de moneda; disponibilidad, capacidad y umbral son supuestos introducidos.</Information></div>
              <Card size="sm"><CardHeader className="gap-0.5"><CardTitle>Disponibilidad real introducida</CardTitle><CardDescription>No crea usuarios ni asigna leads. La contratación sugerida usa ceil y el umbral visible.</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3"><NumericField id="callers" label="Callers disponibles" value={inputs.availableCallers} onChange={(value) => update("availableCallers", value)} /><NumericField id="caller-capacity" label="Leads/caller/día" value={inputs.callerCapacityPerDay} onChange={(value) => update("callerCapacityPerDay", value)} /><NumericField id="closers" label="Closers disponibles" value={inputs.availableClosers} onChange={(value) => update("availableClosers", value)} /><NumericField id="closer-capacity" label="Agendas/closer/día" value={inputs.closerCapacityPerDay} onChange={(value) => update("closerCapacityPerDay", value)} /><NumericField id="utilization" label="Umbral utilización (%)" max={100} value={inputs.targetUtilizationPercent} onChange={(value) => update("targetUtilizationPercent", value)} /></CardContent></Card>
              <Capacity data={discovery.data} />
            </TabsContent>
            <TabsContent value="commission" className="flex flex-col gap-3">
              <div className="flex items-center gap-1"><h3 className="font-semibold">Comisiones e incentivos</h3><Information title="Comisiones e incentivos">Simula fijo por venta, porcentaje de cobros y bonus. El reparto caller/closer es explícito porque el registro histórico no identifica al destinatario.</Information></div>
              <Card size="sm"><CardHeader className="gap-0.5"><CardTitle>Política introducida</CardTitle><CardDescription>No ejecuta pagos. Los importes nominales se aplican por separado dentro de cada moneda.</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3"><NumericField id="fixed-sale" label="Fijo por venta (unidad monetaria)" value={inputs.fixedPerSaleEuros} onChange={(value) => update("fixedPerSaleEuros", value)} /><NumericField id="collections-percent" label="% de cobros" max={100} value={inputs.collectionsPercent} onChange={(value) => update("collectionsPercent", value)} /><NumericField id="caller-share" label="Reparto caller (%)" max={100} value={inputs.callerSharePercent} onChange={(value) => update("callerSharePercent", value)} /><NumericField id="goal-sales" label="Ventas objetivo" value={inputs.goalSales} onChange={(value) => update("goalSales", value)} /><NumericField id="goal-bonus" label="Bonus objetivo (unidad monetaria)" value={inputs.goalBonusEuros} onChange={(value) => update("goalBonusEuros", value)} /><NumericField id="stretch-sales" label="Ventas objetivo ampliado" value={inputs.stretchSales} onChange={(value) => update("stretchSales", value)} /><NumericField id="stretch-bonus" label="Bonus ampliado (unidad monetaria)" value={inputs.stretchBonusEuros} onChange={(value) => update("stretchBonusEuros", value)} /></CardContent></Card>
              {availableCurrencies.map((currency, index) => {
                const query = currencyQueries[index];
                return !query || query.isPending ? <Skeleton key={currency} className="h-40 w-full" /> : query.isError ? <Empty key={currency} heading={`No se pudieron calcular comisiones en ${currency}`} description="No se muestran resultados parciales." /> : <Commission key={currency} data={query.data} currency={currency} />;
              })}
            </TabsContent>
            <TabsContent value="assumptions" className="flex flex-col gap-3">
              <div className="flex items-center gap-1"><h3 className="font-semibold">Base observada</h3><Information title="Base observada">La base usa volumen cerrado, conversión madura a 30 días y economía madura a 90 días. Los valores observados e introducidos se muestran por separado y por moneda.</Information></div>
              {availableCurrencies.map((currency, index) => {
                const query = currencyQueries[index];
                if (!query || query.isPending) return <Skeleton key={currency} className="h-32 w-full" />;
                if (query.isError) return <Empty key={currency} heading={`No se pudo cargar la base en ${currency}`} description="No se muestran supuestos parciales." />;
                return <Card key={currency} size="sm"><CardHeader className="gap-0.5"><div className="flex items-center justify-between gap-2"><CardTitle>Base y escenario</CardTitle><Badge variant="outline">{currency}</Badge></div><CardDescription>{query.data.baseline.status === "available" ? query.data.baseline.rule : `Conversión madura: ${query.data.baseline.coverage.conversionMature}/${query.data.baseline.coverage.minimumConversionSample}. No se inventan tasas ni economía.`}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><AssumptionCards data={query.data.baseline.assumptions} /><h4 className="text-sm font-semibold">Supuestos efectivos del Escenario</h4><AssumptionCards data={query.data.scenario.assumptions} /></CardContent></Card>;
              })}
            </TabsContent>
          </Tabs>
        </>}
    </section>
  );
}
