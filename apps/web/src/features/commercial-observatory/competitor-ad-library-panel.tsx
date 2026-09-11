"use client";

import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
} from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@crm-fran/api/routers/index";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Empty } from "@crm-fran/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";

import { trpc } from "@/utils/trpc";

type Overview = inferRouterOutputs<AppRouter>["competitorAds"]["overview"];
type CompetitorAd = Overview["ads"][number];
type CompetitorMetric = CompetitorAd["metrics"][number];
type CompetitorSource = Overview["sources"][number];

type SourceForm = {
  id?: string;
  metaPageId: string;
  displayName: string;
  countries: string;
  enabled: boolean;
};

const EMPTY_SOURCE: SourceForm = {
  metaPageId: "",
  displayName: "",
  countries: "ES",
  enabled: true,
};

const observationLabels = {
  new: "Nuevo",
  changed: "Modificado",
  inactive: "Inactivo",
} as const;

const statusLabels = {
  succeeded: "Completada",
  partial: "Parcial",
  failed: "No completada",
} as const;

const metricLabels = {
  eu_total_reach: "Alcance UE",
  impressions: "Impresiones",
  spend: "Gasto",
} as const;

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function formatDay(value: string | null) {
  if (!value) return "En curso";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function parseCountries(value: string) {
  return [...new Set(
    value
      .split(",")
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean),
  )].sort();
}

function metricPresentation(metric: CompetitorMetric) {
  if (metric.classification === "estimated" && metric.exactValue) {
    return { provenance: "Estimado", value: "≈ " + metric.exactValue };
  }
  if (
    metric.classification === "range"
    && metric.lowerBound
    && metric.upperBound
  ) {
    const currency = metric.currency ? " " + metric.currency : "";
    return {
      provenance: "Rango",
      value: metric.lowerBound + "–" + metric.upperBound + currency,
    };
  }
  return { provenance: "No disponible", value: "No disponible" };
}

function MetricEvidence({ metric }: { metric: CompetitorMetric }) {
  const presentation = metricPresentation(metric);
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{metricLabels[metric.name]}</span>
      <span className="font-medium tabular-nums">{presentation.value}</span>
      <Badge variant="outline">{presentation.provenance}</Badge>
    </div>
  );
}

function SourceConfiguration({
  sources,
  onSaved,
}: {
  sources: Overview["sources"];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<SourceForm>(EMPTY_SOURCE);
  const countries = parseCountries(form.countries);
  const pageIdInvalid = form.metaPageId.length > 0 && !/^\d{1,64}$/.test(form.metaPageId);
  const countriesInvalid = countries.length === 0
    || countries.some((country) => !/^[A-Z]{2}$/.test(country));

  const saveSource = useMutation(
    trpc.competitorAds.saveSource.mutationOptions({
      onSuccess: async () => {
        toast.success(form.id ? "Competidor actualizado" : "Competidor añadido");
        setForm(EMPTY_SOURCE);
        await onSaved();
      },
      onError: () => {
        toast.error("No se pudo guardar la configuración del competidor");
      },
    }),
  );
  const setSourceEnabled = useMutation(
    trpc.competitorAds.setSourceEnabled.mutationOptions({
      onSuccess: async (_, variables) => {
        toast.success(variables.enabled ? "Seguimiento activado" : "Seguimiento desactivado");
        await onSaved();
      },
      onError: () => {
        toast.error("No se pudo cambiar el estado del seguimiento");
      },
    }),
  );

  const editSource = (source: CompetitorSource) => {
    setForm({
      id: source.id,
      metaPageId: source.metaPageId,
      displayName: source.displayName,
      countries: source.countries.join(", "),
      enabled: source.enabled,
    });
  };

  const submit = () => {
    if (
      !form.displayName.trim()
      || pageIdInvalid
      || countriesInvalid
      || !form.metaPageId
    ) {
      toast.error("Revisa el nombre, el Page ID y los países");
      return;
    }
    saveSource.mutate({
      id: form.id,
      metaPageId: form.metaPageId,
      displayName: form.displayName.trim(),
      countries,
      enabled: form.enabled,
    });
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Configuración de competidores</CardTitle>
        <CardDescription>
          Solo Admin puede cambiar estas fuentes. La sincronización diaria se ejecuta mediante el planificador externo.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setForm(EMPTY_SOURCE)}>
            <PlusIcon data-icon="inline-start" />
            Nuevo competidor
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(24rem,1.15fr)]">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="competitor-name">Nombre visible</FieldLabel>
            <Input
              id="competitor-name"
              value={form.displayName}
              onChange={(event) => setForm((current) => ({
                ...current,
                displayName: event.target.value,
              }))}
              placeholder="Competidor"
            />
          </Field>
          <Field invalid={pageIdInvalid}>
            <FieldLabel htmlFor="competitor-page-id">Meta Page ID</FieldLabel>
            <Input
              id="competitor-page-id"
              inputMode="numeric"
              value={form.metaPageId}
              aria-invalid={pageIdInvalid}
              onChange={(event) => setForm((current) => ({
                ...current,
                metaPageId: event.target.value.trim(),
              }))}
              placeholder="123456789"
            />
            <FieldDescription>Identificador numérico público de la página de Meta.</FieldDescription>
            {pageIdInvalid ? <FieldError>Usa únicamente dígitos.</FieldError> : null}
          </Field>
          <Field invalid={countriesInvalid}>
            <FieldLabel htmlFor="competitor-countries">Países</FieldLabel>
            <Input
              id="competitor-countries"
              value={form.countries}
              aria-invalid={countriesInvalid}
              onChange={(event) => setForm((current) => ({
                ...current,
                countries: event.target.value,
              }))}
              placeholder="ES, PT"
            />
            <FieldDescription>Códigos ISO de dos letras separados por comas. Por defecto: ES.</FieldDescription>
            {countriesInvalid ? <FieldError>Indica al menos un país con dos letras.</FieldError> : null}
          </Field>
          <Field className="flex-row items-center">
            <Checkbox
              id="competitor-enabled"
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((current) => ({
                ...current,
                enabled: checked,
              }))}
            />
            <FieldLabel htmlFor="competitor-enabled">Seguimiento habilitado</FieldLabel>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                saveSource.isPending
                || !form.displayName.trim()
                || !form.metaPageId
                || pageIdInvalid
                || countriesInvalid
              }
              onClick={submit}
            >
              <SaveIcon data-icon="inline-start" />
              {form.id ? "Guardar cambios" : "Añadir competidor"}
            </Button>
            {form.id ? (
              <Button variant="ghost" onClick={() => setForm(EMPTY_SOURCE)}>
                Cancelar edición
              </Button>
            ) : null}
          </div>
        </FieldGroup>

        {sources.length === 0 ? (
          <Empty
            heading="No hay competidores configurados"
            description="Añade el primer Meta Page ID para preparar el seguimiento diario."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((source) => (
              <article
                key={source.id}
                className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{source.displayName}</h3>
                    <Badge variant={source.enabled ? "secondary" : "outline"}>
                      {source.enabled ? "Habilitado" : "Deshabilitado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Page ID {source.metaPageId} · {source.countries.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Actualizado {formatDateTime(source.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => editSource(source)}>
                    <PencilIcon data-icon="inline-start" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={setSourceEnabled.isPending}
                    onClick={() => setSourceEnabled.mutate({
                      id: source.id,
                      enabled: !source.enabled,
                    })}
                  >
                    {source.enabled ? "Deshabilitar" : "Habilitar"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdsTable({ ads }: { ads: Overview["ads"] }) {
  if (ads.length === 0) {
    return (
      <Empty
        heading="Aún no hay anuncios observados"
        description="Cuando termine una sincronización diaria válida, aparecerán aquí las últimas observaciones disponibles."
      />
    );
  }

  return (
    <Table className="min-w-7xl">
      <TableHeader>
        <TableRow>
          <TableHead>Competidor y creativo</TableHead>
          <TableHead>Observación</TableHead>
          <TableHead>Primera observación</TableHead>
          <TableHead>Última observación</TableHead>
          <TableHead>Entrega</TableHead>
          <TableHead>Plataformas</TableHead>
          <TableHead>Métricas publicadas</TableHead>
          <TableHead>Fuente</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ads.map((ad) => {
          const creativeTitle = ad.publicFields.creative.titles[0]
            ?? ad.publicFields.creative.bodies[0]
            ?? "Anuncio " + ad.providerAdId;
          return (
            <TableRow key={ad.id}>
              <TableCell className="max-w-72 whitespace-normal">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{ad.sourceName}</span>
                  <span className="line-clamp-2">{creativeTitle}</span>
                  <span className="text-xs text-muted-foreground">ID {ad.providerAdId}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={ad.observation === "inactive" ? "outline" : "secondary"}>
                    {observationLabels[ad.observation]}
                  </Badge>
                  {!ad.coverageComplete ? <Badge variant="outline">Cobertura parcial</Badge> : null}
                </div>
              </TableCell>
              <TableCell>{formatDateTime(ad.firstSeenAt)}</TableCell>
              <TableCell>{formatDateTime(ad.lastSeenAt)}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span>{formatDay(ad.publicFields.deliveryStart)}</span>
                  <span className="text-xs text-muted-foreground">
                    hasta {formatDay(ad.publicFields.deliveryStop)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="max-w-52 whitespace-normal">
                {ad.publicFields.publisherPlatforms.length > 0
                  ? ad.publicFields.publisherPlatforms.join(", ")
                  : "No disponible"}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-3">
                  {ad.metrics.map((metric) => (
                    <MetricEvidence key={metric.name} metric={metric} />
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-44 flex-col items-start gap-2">
                  <span className="text-xs text-muted-foreground">
                    Recuperado {formatDateTime(ad.retrievedAt)}
                  </span>
                  {ad.publicFields.creative.snapshotUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={(
                        <a
                          href={ad.publicFields.creative.snapshotUrl}
                          target="_blank"
                          rel="noreferrer"
                        />
                      )}
                    >
                      <ExternalLinkIcon data-icon="inline-start" />
                      Ver creativo
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Enlace no disponible</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SyncHistory({ runs }: { runs: Overview["runs"] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Historial de sincronización diaria</CardTitle>
        <CardDescription>
          Registro agregado del planificador. Esta pantalla no inicia sincronizaciones ni muestra errores internos del proveedor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <Empty
            heading="Sin sincronizaciones registradas"
            description="El historial aparecerá después de la primera ejecución programada."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Finalizada</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Competidores</TableHead>
                <TableHead className="text-right">Anuncios vistos</TableHead>
                <TableHead className="text-right">Nuevos o modificados</TableHead>
                <TableHead className="text-right">Sin cambios</TableHead>
                <TableHead className="text-right">Inactivos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{formatDateTime(run.completedAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={run.requiresAttention ? "destructive" : "secondary"}>
                        {statusLabels[run.status]}
                      </Badge>
                      {!run.coverageComplete ? <Badge variant="outline">Cobertura parcial</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{run.competitorCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.adsSeen}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.snapshotsInserted}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.snapshotsUnchanged}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.adsMarkedInactive}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function CompetitorAdLibraryPanel({ canConfigure }: { canConfigure: boolean }) {
  const queryClient = useQueryClient();
  const overview = useQuery(trpc.competitorAds.overview.queryOptions());

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.competitorAds.overview.queryKey(),
    });
  };

  if (overview.isPending) {
    return (
      <section className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-80 md:col-span-2" />
      </section>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <Empty
        heading="No se pudo cargar la inteligencia de competidores"
        description="La fuente todavía no está disponible o su configuración necesita revisión. No se muestran datos parciales."
      />
    );
  }

  const data = overview.data;
  const enabledSources = data.sources.filter((source) => source.enabled);
  const activeAds = data.ads.filter((ad) => ad.isActive);
  const newAds = data.ads.filter((ad) => ad.observation === "new");
  const changedAds = data.ads.filter((ad) => ad.observation === "changed");
  const inactiveAds = data.ads.filter((ad) => ad.observation === "inactive");

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="competitor-intelligence-title">
      <header className="flex flex-col gap-1">
        <h2 id="competitor-intelligence-title" className="text-xl font-semibold">
          Inteligencia de competidores
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Últimas observaciones públicas de Meta Ad Library. Describe anuncios y cambios detectados; no atribuye resultados ni genera conclusiones con IA.
        </p>
      </header>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Cómo leer estos datos</CardTitle>
          <CardDescription>
            Cada anuncio conserva su primera y última observación. Un rango se muestra como rango y un valor estimado como estimación; los datos ausentes nunca se convierten en cero ni se suman con métricas no comparables.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">Estimado: aproximación publicada por la fuente</Badge>
          <Badge variant="outline">Rango: límites publicados por la fuente</Badge>
          <Badge variant="outline">No disponible: la fuente no publicó el dato</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card size="sm">
          <CardHeader><CardTitle>Competidores activos</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{enabledSources.length}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Anuncios activos</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{activeAds.length}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Nuevos</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{newAds.length}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Modificados</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{changedAds.length}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Inactivos</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{inactiveAds.length}</CardContent>
        </Card>
      </div>

      {canConfigure ? <SourceConfiguration sources={data.sources} onSaved={invalidate} /> : null}

      {data.sources.length === 0 ? (
        <Empty
          heading="No hay competidores configurados"
          description={canConfigure
            ? "Añade un competidor para preparar la sincronización diaria."
            : "Administración todavía no ha configurado fuentes de competencia."}
        />
      ) : enabledSources.length === 0 ? (
        <Empty
          heading="Seguimiento desactivado"
          description="Todos los competidores están deshabilitados. El histórico permanece visible."
        />
      ) : (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Últimas observaciones disponibles</CardTitle>
            <CardDescription>
              Estado actual y último cambio conservado por anuncio. La cobertura parcial nunca marca ausencias como inactividad.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdsTable ads={data.ads} />
          </CardContent>
        </Card>
      )}

      <SyncHistory runs={data.runs} />
    </section>
  );
}
