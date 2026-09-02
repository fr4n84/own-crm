"use client";

import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Input } from "@crm-fran/ui/components/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { commercialUiLabel } from "@/lib/commercial-ui-labels";
import { trpc } from "@/utils/trpc";

const today = () => new Date().toISOString();
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);

function Information({ title, children }: { title: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="size-11" aria-label={`Información sobre ${title}`} />}>
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function CurrencyScope({ currencies }: { currencies: readonly string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Monedas de la evidencia">
      <span className="text-xs font-medium">Cálculos disponibles</span>
      {currencies.map((currency) => <Badge key={currency} variant="outline">{currency}</Badge>)}
      <Information title="Separación por moneda">
        Cada moneda se calcula y presenta por separado. No se suman importes de monedas distintas. No se aplica conversión FX.
      </Information>
    </div>
  );
}

export function CommercialEvidencePanel() {
  const { permissions } = usePermissionState();
  const admin = permissions.includes("*");
  const [query, setQuery] = useState("");
  const [leadId, setLeadId] = useState("");
  const [asOf] = useState(today);
  const currencyQuery = useQuery(trpc.commercialEvidence.currencies.queryOptions());
  const leads = useQuery(trpc.commercialEvidence.searchLeads.queryOptions({ query }));
  const currencies = currencyQuery.data ?? [];
  const evidenceQueries = useQueries({
    queries: currencies.map((currency) => ({
      ...trpc.commercialEvidence.lead.queryOptions({ leadId, asOf, currency }),
      enabled: Boolean(leadId),
    })),
  });
  const microsegmentQueries = useQueries({
    queries: currencies.map((currency) => ({
      ...trpc.commercialEvidence.microsegments.queryOptions({ asOf, currency }),
      enabled: admin,
    })),
  });
  const confidence = useQuery({
    ...trpc.commercialEvidence.confidence.queryOptions({ asOf }),
    enabled: admin,
  });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="commercial-evidence-title">
      <div>
        <div className="flex items-center gap-1">
          <h2 id="commercial-evidence-title" className="text-xl font-semibold">Evidencia comercial explicable</h2>
          <Information title="Cómo se construye">
            Solo usa hechos confirmados hasta la fecha de corte. La conversión madura a 30 días y el margen a 90. No mezcla monedas, no usa texto libre, no demuestra causalidad y no ejecuta acciones.
          </Information>
        </div>
        <p className="text-sm text-muted-foreground">
          Probabilidad observacional, margen real esperado y casos comparables; nunca una decisión automática.
        </p>
      </div>

      <Card size="sm">
        <CardHeader className="gap-0.5">
          <CardTitle>Lead analizado</CardTitle>
          <CardDescription>Busca un lead; el servidor conserva cada cálculo económico en su moneda original.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)]">
          <Input aria-label="Buscar lead" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead" />
          <Select value={leadId} onValueChange={(value) => setLeadId(value ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona un lead" /></SelectTrigger>
            <SelectContent><SelectGroup>{(leads.data ?? []).map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <div className="lg:col-span-2">
            {leads.isPending ? <p className="text-sm text-muted-foreground">Cargando leads…</p>
              : leads.isError ? <Empty className="py-4" heading="No se pudieron cargar los leads" description="Vuelve a intentarlo; no se ha calculado evidencia parcial." />
              : leads.data.length === 0 ? <Empty className="py-4" heading="No hay leads disponibles" description="No hay leads visibles para tu rol y búsqueda actual." />
              : currencyQuery.isPending ? <p className="text-sm text-muted-foreground">Cargando evidencia económica…</p>
              : currencyQuery.isError ? <Empty className="py-4" heading="No se pudo determinar la moneda" description="No se elegirá una moneda por defecto ni se aplicará conversión FX." />
              : currencies.length === 0 ? <Empty className="py-4" heading="Verdad económica insuficiente" description="Todavía no existe evidencia financiera con moneda registrada." />
              : <CurrencyScope currencies={currencies} />}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="score">
        <TabsList className="h-auto w-fit max-w-full flex-nowrap justify-start gap-1 rounded-lg border bg-muted/40 p-1">
          <TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="score">Score económico</TabsTrigger>
          <TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="twins">Casos gemelos</TabsTrigger>
          {admin ? <TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="micro">Microsegmentos</TabsTrigger> : null}
          {admin ? <TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="confidence">Confianza</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="score">
          {!leadId ? <Empty heading="Selecciona un lead" description="Necesitamos un lead para construir una cohorte histórica sin fuga temporal." />
            : currencies.length === 0 ? <Empty heading="Verdad económica insuficiente" description="No existe una moneda económica que pueda analizarse sin mezclar importes." />
            : <div className="grid gap-3 lg:grid-cols-2">{currencies.map((currency, index) => {
              const evidence = evidenceQueries[index];
              if (!evidence || evidence.isPending) return <Skeleton key={currency} className="h-40 w-full" />;
              if (evidence.isError) return <Empty key={currency} heading={`No se pudo calcular en ${currency}`} description="No se muestra evidencia parcial." />;
              return (
                <Card key={currency} size="sm">
                  <CardHeader className="gap-0.5">
                    <div className="flex items-center justify-between gap-2"><CardTitle>Margen esperado real</CardTitle><Badge variant="outline">{currency}</Badge></div>
                    <CardDescription>Estimación observacional · {evidence.data.score.policyVersion}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <p className="text-2xl font-semibold">{evidence.data.score.expectedMarginCents === null ? "Verdad económica insuficiente" : money(evidence.data.score.expectedMarginCents, currency)}</p>
                    <p className="text-xs text-muted-foreground">Probabilidad {(evidence.data.score.probabilityBps / 100).toFixed(1)}% · n={evidence.data.score.denominator} · respaldo {commercialUiLabel(evidence.data.score.fallback)} · confianza {commercialUiLabel(evidence.data.score.confidence)}</p>
                    <p className="text-xs text-muted-foreground">Índice 0–100: {evidence.data.score.score0To100 ?? "muestra monetaria insuficiente"} · escala P10/P90 de la cohorte en {currency}</p>
                  </CardContent>
                </Card>
              );
            })}</div>}
        </TabsContent>

        <TabsContent value="twins" className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <h3 className="font-semibold">Casos gemelos explicables</h3>
            <Information title="Casos comparables">Compara únicamente casos maduros con factores previos parecidos. Las referencias son opacas y el parecido no implica causalidad.</Information>
          </div>
          {!leadId ? <Empty heading="Sin casos comparables" description="Selecciona un lead para buscar casos maduros." />
            : currencies.map((currency, index) => {
              const evidence = evidenceQueries[index];
              if (!evidence || evidence.isPending) return <Skeleton key={currency} className="h-32 w-full" />;
              if (evidence.isError) return <Empty key={currency} heading={`No se pudieron cargar los casos gemelos en ${currency}`} description="No se muestran comparables parciales ni referencias inseguras." />;
              if (evidence.data.twins.status === "reference_secret_missing") return <Empty key={currency} heading="Referencias no disponibles" description="Falta la configuración privada necesaria para generar referencias opacas seguras." />;
              if (evidence.data.twins.items.length === 0) return <Empty key={currency} heading="No hay casos gemelos comparables" description={`No existe una muestra madura suficientemente parecida en ${currency}.`} />;
              return (
                <Card key={currency} size="sm">
                  <CardHeader className="gap-0.5"><CardTitle>Comparables en {currency}</CardTitle><CardDescription>{evidence.data.twins.items.length} casos maduros, sin mezclar monedas.</CardDescription></CardHeader>
                  <CardContent className="max-h-72 overflow-auto p-0" tabIndex={0} aria-label={`Casos gemelos en ${currency}`}>
                    <div className="overflow-x-auto">
                      <Table className="min-w-2xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Caso opaco</TableHead><TableHead className="h-8">Peso</TableHead><TableHead className="h-8">Resultado</TableHead><TableHead className="h-8">Factores</TableHead></TableRow></TableHeader>
                        <TableBody>{evidence.data.twins.items.map((item) => <TableRow className="h-9" key={item.caseRef}><TableCell className="py-1">{item.caseRef}</TableCell><TableCell className="py-1">{Math.round(item.weight * 100)}%</TableCell><TableCell className="py-1">{item.sold ? "Venta" : "Sin venta"}</TableCell><TableCell className="py-1">{item.matchedFactors.map(commercialUiLabel).join(", ")}</TableCell></TableRow>)}</TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </TabsContent>

        {admin ? <TabsContent value="micro" className="flex flex-col gap-3">
          <div className="flex items-center gap-1"><h3 className="font-semibold">Microsegmentos observacionales</h3><Information title="Microsegmentos">Solo muestra intersecciones maduras con al menos 30 casos. El lift y el margen son descriptivos, no causales, y se calculan por moneda.</Information></div>
          {currencies.length === 0 ? <Empty heading="Muestra insuficiente" description="No hay verdad económica con moneda registrada." /> : currencies.map((currency, index) => {
            const micro = microsegmentQueries[index];
            if (!micro || micro.isPending) return <Skeleton key={currency} className="h-32 w-full" />;
            if (micro.isError) return <Empty key={currency} heading={`No se pudieron cargar los microsegmentos en ${currency}`} description="No se muestran resultados parciales." />;
            if (micro.data.length === 0) return <Empty key={currency} heading="Muestra insuficiente" description={`No hay intersecciones maduras con al menos 30 casos en ${currency}.`} />;
            return <Card key={currency} size="sm"><CardHeader className="gap-0.5"><CardTitle>Segmentos en {currency}</CardTitle><CardDescription>{micro.data.length} intersecciones maduras.</CardDescription></CardHeader><CardContent className="max-h-72 overflow-auto p-0" tabIndex={0} aria-label={`Microsegmentos en ${currency}`}><div className="overflow-x-auto"><Table className="min-w-3xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Segmento</TableHead><TableHead className="h-8">Muestra</TableHead><TableHead className="h-8">Conversión ajustada</TableHead><TableHead className="h-8">Lift</TableHead><TableHead className="h-8">Margen esperado</TableHead></TableRow></TableHeader><TableBody>{micro.data.map((row) => <TableRow className="h-9" key={JSON.stringify(row.segment)}><TableCell className="py-1">{row.segment.map(([key, value]) => `${commercialUiLabel(key)}: ${commercialUiLabel(value)}`).join(" · ")}</TableCell><TableCell className="py-1">{row.sample}</TableCell><TableCell className="py-1">{(row.conversionBps / 100).toFixed(1)}%</TableCell><TableCell className="py-1">{(row.liftBps / 100).toFixed(1)} pp</TableCell><TableCell className="py-1">{row.expectedMarginCents === null ? "Sin verdad económica" : money(row.expectedMarginCents, currency)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>;
          })}
        </TabsContent> : null}

        {admin ? <TabsContent value="confidence">
          {confidence.isPending ? <Skeleton className="h-40 w-full" />
            : confidence.isError ? <Empty heading="No se pudo cargar la calibración" description="No se calculan métricas con datos parciales." />
            : confidence.data.coverage.maturedShown === 0 ? <Empty heading="Muestra insuficiente" description="Aún no hay recomendaciones mostradas con 30 días de madurez." />
            : <Card size="sm">
              <CardHeader className="gap-0.5"><div className="flex items-center gap-1"><CardTitle>Centro de confianza</CardTitle><Information title="Calibración">Contrasta predicciones previamente mostradas con resultados posteriores maduros. Brier y ECE describen error de calibración; no cambian modelos ni decisiones, porque los cambios permanecen en modo sombra.</Information></div><CardDescription>Calibración semanal de instantáneas maduras controladas por el servidor; cambios solo en modo sombra.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-2 sm:grid-cols-3"><div><p className="text-lg font-semibold">{confidence.data.coverage.calibrated}/{confidence.data.coverage.maturedShown}</p><p className="text-xs text-muted-foreground">Calibrados / maduros</p></div><div><p className="text-lg font-semibold">{confidence.data.brier?.toFixed(3) ?? "—"}</p><p className="text-xs text-muted-foreground">Brier</p></div><div><p className="text-lg font-semibold">{confidence.data.ece?.toFixed(3) ?? "—"}</p><p className="text-xs text-muted-foreground">ECE</p></div></div>
                <p className="text-xs text-muted-foreground">{confidence.data.legacyExcluded} históricos excluidos · {confidence.data.missingEconomic} sin verdad económica · cobertura {confidence.data.coverage.rateBps === null ? "—" : `${confidence.data.coverage.rateBps / 100}%`}</p>
                <div className="grid gap-3 lg:grid-cols-3">
                  {([["Historial semanal", confidence.data.weekly], ["Por política", confidence.data.byPolicy], ["Por nivel de respaldo", confidence.data.byFallback]] as const).map(([title, rows]) => <Card key={title} size="sm"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="max-h-40 overflow-auto">{rows.length === 0 ? <p className="text-xs text-muted-foreground">Sin grupos maduros.</p> : rows.map((row) => <p key={row.key} className="py-1 text-xs">{commercialUiLabel(row.key)} · n={row.sample} · {title === "Historial semanal" ? `Brier ${row.brier?.toFixed(3) ?? "—"}` : `ECE ${row.ece?.toFixed(3) ?? "—"}`}</p>)}</CardContent></Card>)}
                </div>
                <div className="max-h-72 overflow-auto" tabIndex={0} aria-label="Intervalos de calibración"><div className="overflow-x-auto"><Table className="min-w-xl"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Rango</TableHead><TableHead className="h-8">Muestra</TableHead><TableHead className="h-8">Predicho</TableHead><TableHead className="h-8">Real</TableHead><TableHead className="h-8">IC 95%</TableHead></TableRow></TableHeader><TableBody>{confidence.data.bins.filter((bin) => bin.sample > 0).map((bin) => <TableRow className="h-9" key={bin.fromBps}><TableCell className="py-1">{bin.fromBps / 100}%–{bin.toBps / 100}%</TableCell><TableCell className="py-1">{bin.sample}</TableCell><TableCell className="py-1">{bin.predictedBps === null ? "—" : `${bin.predictedBps / 100}%`}</TableCell><TableCell className="py-1">{bin.actualBps === null ? "—" : `${bin.actualBps / 100}%`}</TableCell><TableCell className="py-1">{bin.actualWilsonBps ? `${bin.actualWilsonBps.low / 100}%–${bin.actualWilsonBps.high / 100}%` : "—"}</TableCell></TableRow>)}</TableBody></Table></div></div>
              </CardContent>
            </Card>}
        </TabsContent> : null}
      </Tabs>
    </section>
  );
}
