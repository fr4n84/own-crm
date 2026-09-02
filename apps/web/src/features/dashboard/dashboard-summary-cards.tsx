"use client";

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  CalendarCheckIcon,
  PhoneCallIcon,
  ShoppingCartIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Skeleton } from "@crm-fran/ui/components/skeleton";

import { trpc } from "@/utils/trpc";

import {
  buildDashboardComparison,
  createDefaultDashboardRanges,
  dashboardSummaryQueryInputs,
  isValidDashboardRange,
  type DashboardDateRange,
  type DashboardRanges,
} from "./dashboard-summary";

const metricDefinitions = [
  { key: "leads", label: "Nuevos leads", icon: UsersRoundIcon },
  { key: "contacted", label: "Contactados", icon: PhoneCallIcon },
  { key: "appointments", label: "Citas", icon: CalendarCheckIcon },
  { key: "sales", label: "Ventas", icon: ShoppingCartIcon },
] as const satisfies ReadonlyArray<{
  key: "leads" | "contacted" | "appointments" | "sales";
  label: string;
  icon: LucideIcon;
}>;

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function DateRangeFields({
  id,
  label,
  value,
  lastClosedDay,
  onChange,
}: {
  id: string;
  label: string;
  value: DashboardDateRange;
  lastClosedDay: string;
  onChange: (range: DashboardDateRange) => void;
}) {
  const invalid = !isValidDashboardRange(value, lastClosedDay);
  return (
    <FieldGroup className="grid gap-2 sm:grid-cols-2" aria-label={label}>
      <Field invalid={invalid}>
        <FieldLabel htmlFor={`${id}-from`}>{label}: desde</FieldLabel>
        <Input
          id={`${id}-from`}
          type="date"
          value={value.from}
          max={value.to || lastClosedDay}
          aria-invalid={invalid}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </Field>
      <Field invalid={invalid}>
        <FieldLabel htmlFor={`${id}-to`}>{label}: hasta</FieldLabel>
        <Input
          id={`${id}-to`}
          type="date"
          value={value.to}
          min={value.from}
          max={lastClosedDay}
          aria-invalid={invalid}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </Field>
    </FieldGroup>
  );
}

function MetricCard({
  label,
  icon: Icon,
  primary,
  comparison,
}: {
  label: string;
  icon: LucideIcon;
  primary: number;
  comparison: number;
}) {
  const delta = buildDashboardComparison(primary, comparison);
  return (
    <Card size="sm" className="@container/card bg-linear-to-t from-primary/5 to-card">
      <CardHeader className="gap-0.5">
        <CardDescription className="flex items-center gap-2">
          <Icon aria-hidden="true" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{primary}</CardTitle>
        <CardAction>
          <Badge variant="outline">
            {signed(delta.absolute)}
            {delta.percent === null ? null : ` · ${signed(delta.percent)}%`}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 text-xs">
        <p>Intervalo comparado: {comparison}</p>
        {delta.status === "zero_denominator" ? (
          <p className="text-muted-foreground">
            Base de comparación 0; porcentaje no comparable
          </p>
        ) : (
          <p className="text-muted-foreground">
            Variación {signed(delta.absolute)} · {signed(delta.percent)}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardSummaryCards() {
  const defaults = createDefaultDashboardRanges();
  const [ranges, setRanges] = useState<DashboardRanges>(defaults);
  const lastClosedDay = defaults.primary.to;
  const inputs = dashboardSummaryQueryInputs(ranges);
  const valid = isValidDashboardRange(ranges.primary, lastClosedDay)
    && isValidDashboardRange(ranges.comparison, lastClosedDay);
  const queries = useQueries({
    queries: [
      { ...trpc.dashboard.summary.queryOptions(inputs.primary), enabled: valid },
      { ...trpc.dashboard.summary.queryOptions(inputs.comparison), enabled: valid },
    ],
  });
  const primaryQuery = queries[0];
  const comparisonQuery = queries[1];

  return (
    <section className="flex flex-col gap-3 px-4 lg:px-6" aria-labelledby="dashboard-summary-title">
      <Card size="sm">
        <CardHeader className="gap-0.5">
          <CardTitle id="dashboard-summary-title">Intervalos de estadísticas</CardTitle>
          <CardDescription>
            Elige el periodo principal y el periodo que quieres usar como referencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <DateRangeFields
            id="summary-primary"
            label="Intervalo principal"
            value={ranges.primary}
            lastClosedDay={lastClosedDay}
            onChange={(primary) => setRanges((current) => ({ ...current, primary }))}
          />
          <DateRangeFields
            id="summary-comparison"
            label="Intervalo de comparación"
            value={ranges.comparison}
            lastClosedDay={lastClosedDay}
            onChange={(comparison) => setRanges((current) => ({ ...current, comparison }))}
          />
        </CardContent>
      </Card>

      {!valid ? (
        <Empty heading="Corrige los intervalos de estadísticas" />
      ) : !primaryQuery || !comparisonQuery || primaryQuery.isPending || comparisonQuery.isPending ? (
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Cargando estadísticas"
        >
          {metricDefinitions.map((metric) => (
            <Skeleton key={metric.key} className="h-28 w-full" />
          ))}
        </div>
      ) : primaryQuery.isError || comparisonQuery.isError ? (
        <Empty
          heading="No se pudieron cargar las estadísticas"
          description="No se muestran comparaciones parciales. Revisa ambos intervalos y vuelve a intentarlo."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricDefinitions.map((metric) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              icon={metric.icon}
              primary={primaryQuery.data.metrics[metric.key]}
              comparison={comparisonQuery.data.metrics[metric.key]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
