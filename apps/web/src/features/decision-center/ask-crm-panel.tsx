"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InfoIcon, SearchIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@crm-fran/ui/components/toggle-group";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { resolveAdminPageAccess } from "@/lib/admin-page-access";
import { commercialUiLabel } from "@/lib/commercial-ui-labels";
import { trpc } from "@/utils/trpc";

type AskRequest = {
  question: string;
  overrides?: {
    fromDay?: string;
    toDay?: string;
    currency?: string;
    horizon?: 30 | 60 | 90;
    metric?: "sales" | "margin" | "reaction";
  };
};

const periods = [7, 30, 60, 90, 180, 365] as const;
const horizons = [30, 60, 90] as const;

function parsePeriod(value: string) {
  if (value === "7") return 7;
  if (value === "30") return 30;
  if (value === "60") return 60;
  if (value === "90") return 90;
  if (value === "180") return 180;
  if (value === "365") return 365;
  return null;
}

export function naturalLanguagePeriod(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const match = normalized.match(
    /\bultimos\s+(7|30|60|90|180|365)(?:\s*dias?)?\b|\b(7|30|60|90|180|365)\s*dias?\b/,
  );
  const days = match?.[1] ?? match?.[2];
  if (days) return parsePeriod(days);
  if (/\bsemana\b/.test(normalized)) return 7;
  if (/\bmes\b/.test(normalized)) return 30;
  if (/\b(?:ano|ultimo ano)\b/.test(normalized)) return 365;
  return null;
}

export function resolvedPeriod(
  question: string,
  explicitPeriod: (typeof periods)[number] | null,
) {
  return explicitPeriod ?? naturalLanguagePeriod(question) ?? 30;
}

function parseHorizon(value: string) {
  if (value === "30") return 30;
  if (value === "60") return 60;
  if (value === "90") return 90;
  return null;
}

function dayKeyFromOrdinal(value: number) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

function selectedPeriod(days: number) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const parts = today.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const todayOrdinal = Math.floor(
    Date.UTC(year, month - 1, day) / 86_400_000,
  );
  return {
    fromDay: dayKeyFromOrdinal(todayOrdinal - days),
    toDay: dayKeyFromOrdinal(todayOrdinal - 1),
  };
}

function Information({ title, children }: { title: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-11"
            aria-label={`Información sobre ${title}`}
          />
        }
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

function formatValue(value: number | null, unit: string, currency: string) {
  if (value === null) return "—";
  if (unit === "basis_points") return `${(value / 100).toFixed(1)}%`;
  if (unit === "cents") {
    return currency
      ? new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
          value / 100,
        )
      : `${value} céntimos (moneda no seleccionada)`;
  }
  if (unit === "ratio") {
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("es-ES").format(value);
}

export function AskCrmPanel() {
  const permissionState = usePermissionState();
  const adminAccess = resolveAdminPageAccess(permissionState);
  const isAdmin = adminAccess === "granted";
  const [question, setQuestion] = useState("");
  const [periodOverride, setPeriodOverride] = useState<
    (typeof periods)[number] | null
  >(null);
  const [currency, setCurrency] = useState("");
  const [horizon, setHorizon] = useState<(typeof horizons)[number]>(90);
  const [submitted, setSubmitted] = useState<AskRequest | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const catalog = useQuery({
    ...trpc.askCrm.catalog.queryOptions(),
    enabled: isAdmin,
  });
  const answer = useQuery({
    ...trpc.askCrm.ask.queryOptions(submitted ?? { question: "" }),
    enabled: isAdmin && submitted !== null,
  });
  const period = resolvedPeriod(question, periodOverride);

  if (adminAccess === "loading") {
    return (
      <section className="flex flex-col gap-3" aria-live="polite">
        <p className="text-sm text-muted-foreground">Comprobando permisos…</p>
        <Skeleton className="h-56 w-full" />
      </section>
    );
  }
  if (adminAccess === "error") {
    return (
      <section>
        <Empty
          heading="No se pudieron comprobar los permisos"
          description="No se asume que el acceso esté denegado. Revisa la conexión y vuelve a intentarlo."
        />
      </section>
    );
  }
  if (adminAccess === "denied") {
    return (
      <section>
        <Empty
          heading="Acceso restringido"
          description="Pregúntale al CRM solo está disponible para administración global."
        />
      </section>
    );
  }

  const submit = (
    next: AskRequest = {
      question: question.trim(),
      overrides: {
        ...selectedPeriod(period),
        currency: /^[A-Z]{3}$/.test(currency) ? currency : undefined,
        horizon,
      },
    },
  ) => {
    if (question.trim().length < 3 && next.question.trim().length < 3) return;
    const historyQuestion = question.trim() || next.question;
    setSubmitted(next);
    setHistory((current) =>
      [historyQuestion, ...current.filter((item) => item !== historyQuestion)].slice(
        0,
        5,
      ),
    );
  };

  const result = answer.data;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <h2 className="text-xl font-semibold">Pregúntale al CRM</h2>
          <Information title="Pregúntale al CRM">
            Interpreta español mediante un catálogo cerrado y ejecuta un único modelo de lectura seguro. No usa IA externa, consultas generadas, representaciones vectoriales ni escrituras.
          </Information>
        </div>
        <p className="text-sm text-muted-foreground">
          Consultas agregadas, explicables y de solo lectura sobre la evidencia comercial existente.
        </p>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card size="sm" className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle>Haz una pregunta acotada</CardTitle>
            <CardDescription>
              Los ejemplos solo rellenan el campo. Revisa y edita la pregunta antes de consultar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ask-crm-question">Pregunta</FieldLabel>
                <Input
                  id="ask-crm-question"
                  value={question}
                  minLength={3}
                  maxLength={280}
                  placeholder="¿Qué anomalías hubo este mes?"
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                  }}
                />
                <FieldDescription>
                  Entre 3 y 280 caracteres. No se aceptan SQL ni filtros arbitrarios.
                </FieldDescription>
              </Field>
              <FieldGroup className="grid gap-3 md:grid-cols-3">
                <Field>
                  <FieldLabel>Periodo</FieldLabel>
                  <ToggleGroup
                    value={[String(period)]}
                    className="flex flex-wrap justify-start"
                    onValueChange={(values) => {
                      const next = parsePeriod(values[0] ?? "");
                      if (next !== null) setPeriodOverride(next);
                    }}
                  >
                    {periods.map((item) => (
                      <ToggleGroupItem key={item} value={String(item)}>
                        {item} d
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>
                    La selección manual prevalece sobre la pregunta.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ask-crm-currency">Moneda</FieldLabel>
                  <Input
                    id="ask-crm-currency"
                    value={currency}
                    maxLength={3}
                    placeholder="EUR (opcional)"
                    onChange={(event) =>
                      setCurrency(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z]/g, "")
                          .slice(0, 3),
                      )
                    }
                  />
                  <FieldDescription>
                    Una moneda ISO; nunca se aplica FX.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Horizonte</FieldLabel>
                  <Select
                    value={String(horizon)}
                    onValueChange={(value) => {
                      const next = parseHorizon(value ?? "");
                      if (next !== null) setHorizon(next);
                    }}
                  >
                    <SelectTrigger aria-label="Horizonte">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {horizons.map((item) => (
                          <SelectItem key={item} value={String(item)}>
                            {item} días
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Button
                className="self-start"
                disabled={question.trim().length < 3 || answer.isFetching}
                onClick={() => submit()}
              >
                <SearchIcon data-icon="inline-start" />
                Consultar
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          {catalog.isPending ? (
            <Skeleton className="h-28 w-full" />
          ) : catalog.isError ? (
            <Empty
              heading="No se pudo cargar el catálogo"
              description="No se habilitan consultas fuera del catálogo controlado por el servidor."
            />
          ) : (
            <Card size="sm" className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle>Ejemplos disponibles</CardTitle>
                <CardDescription>
                  Atajos del catálogo seguro; puedes editarlos antes de consultar.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {catalog.data?.length ? (
                  catalog.data.map((item) => (
                    <Button
                      key={item.id}
                      size="xs"
                      variant="outline"
                      onClick={() => setQuestion(item.example)}
                    >
                      {item.title}
                    </Button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No hay ejemplos disponibles ahora mismo.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {history.length > 0 ? (
            <Card size="sm" className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle>Historial de esta sesión</CardTitle>
                <CardDescription>
                  Máximo cinco preguntas; no se guarda en el navegador.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex max-h-32 flex-col items-start gap-1 overflow-y-auto">
                {history.map((item) => (
                  <Button
                    key={item}
                    size="xs"
                    variant="ghost"
                    className="h-auto max-w-full whitespace-normal text-left"
                    onClick={() => setQuestion(item)}
                  >
                    {item}
                  </Button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {answer.isFetching ? (
        <div className="grid gap-3 lg:grid-cols-2" aria-live="polite">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : answer.isError ? (
        <Empty
          heading="No se pudo responder"
          description="No se muestran resultados parciales. Revisa el periodo y los filtros acotados."
        />
      ) : !result ? (
        <Empty
          className="rounded-lg bg-card px-4 ring-1 ring-foreground/10"
          heading="Escribe una pregunta"
          description="Selecciona un ejemplo o formula una pregunta en lenguaje natural."
        />
      ) : result.status === "unsupported" ? (
        <Empty heading="Pregunta no soportada" description={result.message} />
      ) : result.status === "clarification_required" ? (
        <Card size="sm" className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle>Necesito una aclaración</CardTitle>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {result.clarification.options.map((option) => (
              <Button
                key={option}
                variant="outline"
                onClick={() => {
                  if (!submitted) return;
                  const metric =
                    option === "sales" ||
                    option === "margin" ||
                    option === "reaction"
                      ? option
                      : undefined;
                  const isCurrency = /^[A-Z]{3}$/.test(option);
                  const isIntent = !metric && !isCurrency;
                  submit({
                    question: isIntent ? option : submitted.question,
                    overrides: {
                      ...submitted.overrides,
                      metric,
                      currency: isCurrency
                        ? option
                        : submitted.overrides?.currency,
                    },
                  });
                }}
              >
                {commercialUiLabel(option)}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
          {result.status === "insufficient_evidence" ? (
            <Empty
              className="rounded-lg bg-card px-4 ring-1 ring-foreground/10"
              heading="Evidencia insuficiente"
              description={result.summary}
            />
          ) : (
            <Card size="sm" className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle>{result.title}</CardTitle>
                <CardDescription>{result.summary}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {result.rows.length === 0 ? (
                  <Empty
                    heading="Sin filas agregadas"
                    description="La respuesta es válida, pero no hay grupos comparables que mostrar."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grupo</TableHead>
                        <TableHead>Métrica</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Muestra</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row) => (
                        <TableRow key={`${row.label}-${row.metric}`}>
                          <TableCell>{row.label}</TableCell>
                          <TableCell>{commercialUiLabel(row.metric)}</TableCell>
                          <TableCell>
                            {formatValue(
                              row.value,
                              row.unit,
                              result.explanation.currency ?? "",
                            )}
                          </TableCell>
                          <TableCell>{row.sample ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {commercialUiLabel(row.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          <Card size="sm" className="rounded-lg shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-1">
                <CardTitle>Cómo se calculó</CardTitle>
                <Information title="Cómo se calculó">
                  Muestra el alcance temporal real del modelo de lectura, la moneda, la cobertura, las fuentes de datos, la fórmula y los límites. Este bloque aparece también cuando la evidencia es insuficiente.
                </Information>
              </div>
              <CardDescription>
                {result.explanation.interpretation}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {result.explanation.temporalScope.label}
                </Badge>
                <Badge variant="outline">{result.explanation.timeZone}</Badge>
                <Badge variant="outline">
                  {result.explanation.currency ?? "Sin moneda"}
                </Badge>
                <Badge variant="outline">Sin FX</Badge>
                <Badge variant="outline">
                  Total {result.explanation.total}
                </Badge>
                <Badge variant="outline">
                  Madura {result.explanation.matured}
                </Badge>
                <Badge variant="outline">
                  Excluida {result.explanation.excluded}
                </Badge>
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="font-medium">Definición</dt>
                  <dd className="text-muted-foreground">
                    {result.explanation.definition}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Fórmula</dt>
                  <dd className="text-muted-foreground">
                    {result.explanation.formula}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Mínimo</dt>
                  <dd className="text-muted-foreground">
                    {result.explanation.minimum}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Fuentes de datos</dt>
                  <dd className="text-muted-foreground">
                    {result.explanation.datasets
                      .map(commercialUiLabel)
                      .join(", ")}
                  </dd>
                </div>
              </dl>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {result.explanation.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <a
                className="text-sm font-medium underline underline-offset-4"
                href={result.drilldown.route}
              >
                {result.drilldown.label}
              </a>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
