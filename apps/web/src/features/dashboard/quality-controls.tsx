"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3Icon, InfoIcon, Settings2Icon, TrendingDownIcon, UserRoundXIcon } from "lucide-react";

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@crm-fran/ui/components/dialog";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
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
import { Can } from "@crm-fran/ui/permissions/can";

import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { trpc } from "@/utils/trpc";

type QualitySettings = {
  callerAbandonedHours: number;
  closerAbandonedHours: number;
  callerFollowUpGraceHours: number;
  closerFollowUpGraceHours: number;
  callerLowConversionPercent: number;
  closerLowConversionPercent: number;
};

type LeadIssue = {
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  userName: string;
  referenceAt: string;
  elapsedHours: number;
};

type ConversionIssue = {
  userId: string;
  userName: string;
  converted: number;
  total: number;
  percentage: number;
  threshold: number;
};

const SETTINGS_FIELDS: Array<{
  key: keyof QualitySettings;
  label: string;
  max: number;
  suffix: string;
}> = [
  { key: "callerAbandonedHours", label: "Abandono caller", max: 8760, suffix: "horas" },
  { key: "closerAbandonedHours", label: "Abandono closer", max: 8760, suffix: "horas" },
  {
    key: "callerFollowUpGraceHours",
    label: "Margen seguimiento caller",
    max: 8760,
    suffix: "horas",
  },
  {
    key: "closerFollowUpGraceHours",
    label: "Margen seguimiento closer",
    max: 8760,
    suffix: "horas",
  },
  {
    key: "callerLowConversionPercent",
    label: "Conversión mínima caller",
    max: 100,
    suffix: "%",
  },
  {
    key: "closerLowConversionPercent",
    label: "Conversión mínima closer",
    max: 100,
    suffix: "%",
  },
];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInitialInterval() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

const initialInterval = getInitialInterval();

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
      <PopoverContent className="dashboard-arc-theme" align="start">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function LeadIssueList({ items, emptyLabel }: { items: LeadIssue[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  return (
    <div className="flex max-h-48 flex-col gap-1.5 overflow-auto">
      {items.map((item) => (
        <div key={`${item.leadId}-${item.userName}`} className="rounded-lg border p-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium leading-tight">{item.leadName}</p>
              <p className="break-all text-xs text-muted-foreground">{item.leadEmail}</p>
            </div>
            <Badge variant="outline">{item.elapsedHours} h</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Responsable: {item.userName}</p>
        </div>
      ))}
    </div>
  );
}

function ConversionIssueList({ items }: { items: ConversionIssue[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Todos cumplen el umbral configurado.</p>;
  }

  return (
    <div className="flex max-h-48 flex-col gap-1.5 overflow-auto">
      {items.map((item) => (
        <div key={item.userId} className="rounded-lg border p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="break-words text-sm font-medium leading-tight">{item.userName}</p>
            <Badge variant="outline">{item.percentage}%</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.converted} conversiones sobre {item.total} leads · Umbral {item.threshold}%
          </p>
        </div>
      ))}
    </div>
  );
}

function QualitySettingsDialog({ settings }: { settings: QualitySettings }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      SETTINGS_FIELDS.map((field) => [field.key, String(settings[field.key])]),
    ) as Record<keyof QualitySettings, string>,
  );
  const updateSettings = useTrpcMutationWithToast(
    {
      ...trpc.dashboard.updateQualitySettings.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.qualityControls.queryKey(),
        });
      },
    },
    {
      success: "Umbrales de calidad actualizados",
      error: "No se pudieron guardar los umbrales",
    },
  );
  const parsed = Object.fromEntries(
    SETTINGS_FIELDS.map((field) => [field.key, Number(values[field.key])]),
  ) as QualitySettings;
  const invalid = SETTINGS_FIELDS.some((field) => {
    const value = parsed[field.key];
    return !Number.isInteger(value) || value < 0 || value > field.max;
  });

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Settings2Icon data-icon="inline-start" />
        Configurar umbrales
      </DialogTrigger>
      <DialogContent className="dashboard-arc-theme sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Umbrales de control de calidad</DialogTitle>
          <DialogDescription>
            Configura cada rol por separado. Estos valores solo cambian la información mostrada.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {SETTINGS_FIELDS.map((field) => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`quality-${field.key}`}>
                {field.label} ({field.suffix})
              </FieldLabel>
              <Input
                id={`quality-${field.key}`}
                type="number"
                min={0}
                max={field.max}
                value={values[field.key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            disabled={invalid || updateSettings.isPending}
            onClick={() => updateSettings.mutate(parsed)}
          >
            Guardar umbrales
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QualityControls() {
  const [from, setFrom] = useState(initialInterval.from);
  const [to, setTo] = useState(initialInterval.to);
  const [callerId, setCallerId] = useState("all");
  const [closerId, setCloserId] = useState("all");
  const invalidInterval = from > to;
  const quality = useQuery({
    ...trpc.dashboard.qualityControls.queryOptions({
      from,
      to,
      callerId: callerId === "all" ? undefined : callerId,
      closerId: closerId === "all" ? undefined : closerId,
    }),
    enabled: !invalidInterval,
    placeholderData: keepPreviousData,
  });

  return (
    <section className="px-4 lg:px-6" aria-labelledby="quality-controls-title">
      <Card size="sm">
        <CardHeader className="gap-0.5">
          <div className="flex items-center gap-1">
            <CardTitle id="quality-controls-title">Controles de calidad</CardTitle>
            <Information title="Controles de calidad">
              Señales informativas calculadas desde la actividad real de los leads. No generan alertas ni acciones automáticas.
            </Information>
          </div>
          <CardAction>
            {quality.data && (
              <Can permission="settings:write">
                <QualitySettingsDialog settings={quality.data.settings} />
              </Can>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field invalid={invalidInterval}>
              <FieldLabel htmlFor="quality-from">Desde</FieldLabel>
              <Input
                id="quality-from"
                type="date"
                value={from}
                max={to}
                aria-invalid={invalidInterval}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field invalid={invalidInterval}>
              <FieldLabel htmlFor="quality-to">Hasta</FieldLabel>
              <Input
                id="quality-to"
                type="date"
                value={to}
                min={from}
                aria-invalid={invalidInterval}
                onChange={(event) => setTo(event.target.value)}
              />
              {invalidInterval && <FieldError>Hasta no puede ser anterior a Desde.</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="quality-caller">Caller</FieldLabel>
              <Select value={callerId} onValueChange={(value) => setCallerId(value ?? "all")}>
                <SelectTrigger id="quality-caller">
                  <SelectValue>
                    {callerId === "all"
                      ? "Todos los callers"
                      : quality.data?.callers.find((caller) => caller.id === callerId)?.name ??
                        "Todos los callers"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="dashboard-arc-theme">
                  <SelectGroup>
                    <SelectItem value="all">Todos los callers</SelectItem>
                    {quality.data?.callers.map((caller) => (
                      <SelectItem key={caller.id} value={caller.id}>
                        {caller.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="quality-closer">Closer</FieldLabel>
              <Select value={closerId} onValueChange={(value) => setCloserId(value ?? "all")}>
                <SelectTrigger id="quality-closer">
                  <SelectValue>
                    {closerId === "all"
                      ? "Todos los closers"
                      : quality.data?.closers.find((closer) => closer.id === closerId)?.name ??
                        "Todos los closers"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="dashboard-arc-theme">
                  <SelectGroup>
                    <SelectItem value="all">Todos los closers</SelectItem>
                    {quality.data?.closers.map((closer) => (
                      <SelectItem key={closer.id} value={closer.id}>
                        {closer.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          {invalidInterval ? (
            <Empty heading="Corrige el intervalo de fechas" />
          ) : quality.isPending ? (
            <div className="grid gap-3 lg:grid-cols-3" aria-label="Cargando controles de calidad">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : quality.isError ? (
            <Empty heading="No se pudieron cargar los controles de calidad" />
          ) : quality.data ? (
            <div className="grid gap-3 lg:grid-cols-3">
              <Card size="sm">
                <CardHeader className="gap-0.5">
                  <CardTitle><UserRoundXIcon data-icon="inline-start" />Leads abandonados</CardTitle>
                  <CardDescription>Sin actividad relevante durante más tiempo que el umbral.</CardDescription>
                  <CardAction>
                    <Badge variant="outline">
                      {quality.data.abandoned.caller.length + quality.data.abandoned.closer.length}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Caller</p>
                    <LeadIssueList items={quality.data.abandoned.caller} emptyLabel="Sin abandonos de caller." />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Closer</p>
                    <LeadIssueList items={quality.data.abandoned.closer} emptyLabel="Sin abandonos de closer." />
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader className="gap-0.5">
                  <CardTitle><Clock3Icon data-icon="inline-start" />Seguimientos atrasados</CardTitle>
                  <CardDescription>El próximo contacto acordado ya superó su margen.</CardDescription>
                  <CardAction>
                    <Badge variant="outline">
                      {quality.data.lateFollowUps.caller.length + quality.data.lateFollowUps.closer.length}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Caller</p>
                    <LeadIssueList items={quality.data.lateFollowUps.caller} emptyLabel="Sin seguimientos atrasados de caller." />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Closer</p>
                    <LeadIssueList items={quality.data.lateFollowUps.closer} emptyLabel="Sin seguimientos atrasados de closer." />
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader className="gap-0.5">
                  <CardTitle><TrendingDownIcon data-icon="inline-start" />Conversión baja</CardTitle>
                  <CardDescription>Usuarios por debajo del umbral, con su base real de leads.</CardDescription>
                  <CardAction>
                    <Badge variant="outline">
                      {quality.data.lowConversion.caller.length + quality.data.lowConversion.closer.length}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Caller</p>
                    <ConversionIssueList items={quality.data.lowConversion.caller} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Closer</p>
                    <ConversionIssueList items={quality.data.lowConversion.closer} />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
