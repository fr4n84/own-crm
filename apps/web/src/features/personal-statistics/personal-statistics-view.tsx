"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { FEEDBACK_PROFILES } from "@crm-fran/api/call-feedback";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@crm-fran/ui/components/dropdown-menu";
import { Empty } from "@crm-fran/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { cn } from "@crm-fran/ui/lib/utils";

import { trpc } from "@/utils/trpc";
import { CallerQualitySection } from "../feedback-statistics/caller-quality-section";
import {
  selectCallerFilter,
  selectCloserFilter,
  toggleConditionFilter,
} from "./personal-statistics-filters";
import { PersonalGoalsPanel } from "./personal-goals-panel";
import { CallFeedbackUsageCard } from "./call-feedback-usage-card";
import styles from "./personal-statistics.module.css";

const initialPeople = { callerId: "all", closerId: "all" };
const profileLabels = Object.fromEntries(
  FEEDBACK_PROFILES.map(({ value, label }) => [value, label]),
);
const CALLER_CONDITION_KEYS = [
  "unassigned",
  "assigned",
  "wrong_number",
  "no_contact",
  "future_call",
  "not_fit",
  "not_interested",
  "appointment",
  "rescheduled",
] as const;
const CLOSER_CONDITION_KEYS = [
  "appointment",
  "rescheduled",
  "follow_up",
  "sale",
  "not_interested",
  "no_show",
] as const;
type StatisticsMode = "caller" | "closer";
type ConditionKey =
  | (typeof CALLER_CONDITION_KEYS)[number]
  | (typeof CLOSER_CONDITION_KEYS)[number];

const CONDITION_COLORS: Record<ConditionKey, string> = {
  unassigned: "var(--chart-1)",
  assigned: "var(--chart-2)",
  wrong_number: "var(--chart-3)",
  no_contact: "var(--chart-4)",
  future_call: "var(--chart-5)",
  not_fit: "var(--chart-6)",
  not_interested: "var(--chart-7)",
  appointment: "var(--chart-8)",
  rescheduled: "var(--chart-9)",
  follow_up: "var(--chart-5)",
  sale: "var(--chart-2)",
  no_show: "var(--chart-4)",
};

const chartConfig = {
  count: {
    label: "Leads",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function PersonalStatisticsView() {
  const [people, setPeople] = useState(initialPeople);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedConditionsByMode, setSelectedConditionsByMode] = useState<
    Record<StatisticsMode, ConditionKey[]>
  >({
    caller: [...CALLER_CONDITION_KEYS],
    closer: [...CLOSER_CONDITION_KEYS],
  });
  const invalidInterval = Boolean(from && to && from > to);
  const mode: StatisticsMode =
    people.closerId === "all" ? "caller" : "closer";
  const conditionKeys: readonly ConditionKey[] =
    mode === "closer" ? CLOSER_CONDITION_KEYS : CALLER_CONDITION_KEYS;
  const selectedConditions = selectedConditionsByMode[mode];
  const statistics = useQuery({
    ...trpc.leads.personalStatistics.queryOptions({
      callerId: people.callerId === "all" ? undefined : people.callerId,
      closerId: people.closerId === "all" ? undefined : people.closerId,
      from: from || undefined,
      to: to || undefined,
    }),
    enabled: !invalidInterval,
  });
  const callerQuality = useQuery({
    ...trpc.leads.feedbackStatistics.queryOptions({
      callerId: people.callerId === "all" ? undefined : people.callerId,
      from: from || undefined,
      to: to || undefined,
    }),
    enabled: !invalidInterval && mode === "caller",
  });

  return (
    <div
      className={cn(
        styles.theme,
        "flex w-full min-w-0 flex-col gap-4",
      )}
    >
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Caller y closer son excluyentes. El intervalo puede combinarse con
            cualquiera de los dos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field>
              <FieldLabel htmlFor="statistics-caller">Caller</FieldLabel>
              <Select
                value={people.callerId}
                onValueChange={(value) =>
                  setPeople((current) =>
                    selectCallerFilter(current, value ?? "all"),
                  )
                }
              >
                <SelectTrigger id="statistics-caller">
                  <SelectValue>
                    {people.callerId === "all"
                      ? "Todos los callers"
                      : statistics.data?.callers.find(
                          (caller) => caller.id === people.callerId,
                        )?.name ?? "Todos los callers"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={styles.overlayTheme}>
                  <SelectGroup>
                    <SelectItem value="all">Todos los callers</SelectItem>
                    {statistics.data?.callers.map((caller) => (
                      <SelectItem key={caller.id} value={caller.id}>
                        {caller.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="statistics-closer">Closer</FieldLabel>
              <Select
                value={people.closerId}
                onValueChange={(value) =>
                  setPeople((current) =>
                    selectCloserFilter(current, value ?? "all"),
                  )
                }
              >
                <SelectTrigger id="statistics-closer">
                  <SelectValue>
                    {people.closerId === "all"
                      ? "Todos los closers"
                      : statistics.data?.closers.find(
                          (closer) => closer.id === people.closerId,
                        )?.name ?? "Todos los closers"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={styles.overlayTheme}>
                  <SelectGroup>
                    <SelectItem value="all">Todos los closers</SelectItem>
                    {statistics.data?.closers.map((closer) => (
                      <SelectItem key={closer.id} value={closer.id}>
                        {closer.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field invalid={invalidInterval}>
              <FieldLabel htmlFor="statistics-from">Desde</FieldLabel>
              <Input
                id="statistics-from"
                type="date"
                value={from}
                max={to || undefined}
                aria-invalid={invalidInterval}
                onChange={(event) => setFrom(event.target.value)}
              />
              <FieldDescription>
                Actividad registrada; los importados usan la fecha del lead.
              </FieldDescription>
            </Field>

            <Field invalid={invalidInterval}>
              <FieldLabel htmlFor="statistics-to">Hasta</FieldLabel>
              <Input
                id="statistics-to"
                type="date"
                value={to}
                min={from || undefined}
                aria-invalid={invalidInterval}
                onChange={(event) => setTo(event.target.value)}
              />
              {invalidInterval && (
                <FieldError>Hasta no puede ser anterior a Desde.</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel>Estados de las gráficas</FieldLabel>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />}>
                  {selectedConditions.length === conditionKeys.length
                    ? "Todos los estados"
                    : `${selectedConditions.length} estados`}
                </DropdownMenuTrigger>
                <DropdownMenuContent className={styles.overlayTheme}>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Comparar estados</DropdownMenuLabel>
                    {conditionKeys.map((condition) => (
                      <DropdownMenuCheckboxItem
                        key={condition}
                        checked={selectedConditions.includes(condition)}
                        disabled={
                          selectedConditions.length === 1 &&
                          selectedConditions.includes(condition)
                        }
                        onCheckedChange={() =>
                          setSelectedConditionsByMode((current) => ({
                            ...current,
                            [mode]: toggleConditionFilter(
                              current[mode],
                              condition,
                            ) as ConditionKey[],
                          }))
                        }
                      >
                        {(statistics.data?.conditions as
                          | Record<string, string>
                          | undefined)?.[condition] ?? condition}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <FieldDescription>
                Puedes seleccionar varios estados simultáneamente.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <CallFeedbackUsageCard />

      <PersonalGoalsPanel
        selectedUserId={
          people.callerId !== "all"
            ? people.callerId
            : people.closerId !== "all"
              ? people.closerId
              : undefined
        }
      />

      {mode === "caller" && (
        callerQuality.isLoading ? (
          <Skeleton className="h-96" />
        ) : callerQuality.isError ? (
          <Empty heading="No se pudo cargar el ranking de callers" />
        ) : callerQuality.data ? (
          <CallerQualitySection
            data={callerQuality.data.callerQuality}
            profileLabels={profileLabels}
          />
        ) : null
      )}

      {invalidInterval ? (
        <Empty heading="Corrige el intervalo de fechas" />
      ) : statistics.isLoading ? (
        <StatisticsSkeleton conditionCount={conditionKeys.length} />
      ) : statistics.isError ? (
        <Empty heading="No se pudieron cargar las estadísticas" />
      ) : statistics.data ? (
        <>
          <ConditionCharts
            counts={statistics.data.counts as Record<string, number>}
            labels={statistics.data.conditions as Record<string, string>}
            selected={selectedConditions}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <StatisticCard
              title="Total de leads"
              description="Leads incluidos por los filtros actuales"
              value={statistics.data.total}
            />
            {Object.entries(statistics.data.conditions).map(
              ([condition, label]) => (
                <StatisticCard
                  key={condition}
                  title={label}
                  description="Condición actual"
                  value={
                    statistics.data.counts[
                      condition as keyof typeof statistics.data.counts
                    ]
                  }
                />
              ),
            )}
          </div>

        </>
      ) : null}
    </div>
  );
}

function ConditionCharts({
  counts,
  labels,
  selected,
}: {
  counts: Record<string, number>;
  labels: Record<string, string>;
  selected: readonly ConditionKey[];
}) {
  const chartData = selected.map((condition) => ({
    condition,
    label: labels[condition],
    count: counts[condition] ?? 0,
    fill: CONDITION_COLORS[condition],
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Leads por estado</CardTitle>
          <CardDescription>
            Comparación de los estados seleccionados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-80 w-full">
            <BarChart
              accessibilityLayer
              data={chartData}
              layout="vertical"
              margin={{ left: 12 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                dataKey="label"
                type="category"
                tickLine={false}
                axisLine={false}
                width={105}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={4}>
                {chartData.map((entry) => (
                  <Cell key={entry.condition} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribución por estado</CardTitle>
          <CardDescription>
            Peso relativo de los estados seleccionados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-80 w-full">
            <PieChart accessibilityLayer>
              <ChartTooltip
                content={<ChartTooltipContent nameKey="label" />}
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                innerRadius={55}
                outerRadius={100}
                strokeWidth={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.condition} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function StatisticCard({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: number;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={cn(styles.metricValue, "tabular-nums")}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function StatisticsSkeleton({ conditionCount }: { conditionCount: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: conditionCount + 1 }, (_, index) => (
        <Card key={index} size="sm">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
