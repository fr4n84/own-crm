"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Button } from "@crm-fran/ui/components/button";
import { Empty } from "@crm-fran/ui/components/empty";
import { DataTable } from "@crm-fran/ui/components/data-table";
import {
  Field,
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
import { Can } from "@crm-fran/ui/permissions/can";

import { trpc } from "@/utils/trpc";
import { createAgendaColumns } from "@/features/agendas/agenda-columns";
import {
  CLOSER_OUTCOMES,
  filterAgendaLeads,
  filterAgendaLeadsByCloser,
  filterAgendaLeadsByCloserOutcome,
  filterAgendaLeadsByDateRange,
  formatLocalDate,
  getAgendaClosers,
  type CloserOutcomeFilter,
} from "@/features/agendas/agenda-utils";
import { AgendaRescheduleDialog } from "@/features/agendas/agenda-reschedule-dialog";
import LeadViewDrawer from "@/features/leads/lead-view-drawer";
import AssignLeadDrawer, {
  type Lead,
} from "@/features/leads/assign-lead-drawer";
import styles from "./agendas.module.css";

export default function AgendasPage() {
  return (
    <div className={styles.theme}>
      <Can permission="leads:read" fallback={<p>No tenés permisos</p>}>
        <AgendasPageContent />
      </Can>
    </div>
  );
}

function AgendasPageContent() {
  const [closerFilter, setCloserFilter] = useState("all");
  const [closerOutcomeFilter, setCloserOutcomeFilter] =
    useState<CloserOutcomeFilter>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const { data, isLoading, isError } = useQuery(
    trpc.leads.listAll.queryOptions(),
  );

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-4 sm:pt-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-6xl pt-4 sm:pt-6">
        <p>Error al cargar agendas</p>
      </div>
    );
  }

  const agendaLeads = filterAgendaLeads(data ?? []);
  const closers = getAgendaClosers(agendaLeads);
  const closerAgendaLeads = filterAgendaLeadsByCloser(agendaLeads, closerFilter);
  const outcomeAgendaLeads = filterAgendaLeadsByCloserOutcome(
    closerAgendaLeads,
    closerOutcomeFilter,
  );
  const filteredAgendaLeads = filterAgendaLeadsByDateRange(
    outcomeAgendaLeads,
    dateRange.from,
    dateRange.to,
  );
  const today = formatLocalDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatLocalDate(tomorrowDate);

  const selectQuickDate = (date: string) => {
    setDateRange({ from: date, to: date });
  };

  if (agendaLeads.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pt-4 sm:pt-6">
        <AgendaHeading />
        <Empty heading="No hay agendas" />
      </div>
    );
  }

  const agendaColumns = createAgendaColumns((lead) => (
    <div className="flex gap-2">
      <LeadViewDrawer
        lead={{
          id: lead.id,
          questions: lead.questions.map((question) => ({
            questionKey: question.questionKey ?? "",
            question: question.question ?? question.questionKey ?? "",
            answer: question.answer,
            authorRole: question.authorRole,
            authorId: question.authorId ?? null,
          })),
          feedback: lead.feedback,
        }}
      />
      <AgendaRescheduleDialog lead={lead} />
      <AssignLeadDrawer
        lead={lead as unknown as Lead}
        triggerLabel="Feedback"
        mode="agenda-feedback"
      />
    </div>
  ));

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 pt-4 sm:pt-6">
      <AgendaHeading />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Combina el closer con un intervalo de fechas o usa un acceso rápido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field>
              <FieldLabel htmlFor="agenda-closer">Closer</FieldLabel>
              <Select
                value={closerFilter}
                onValueChange={(value) => setCloserFilter(value ?? "all")}
              >
                <SelectTrigger
                  id="agenda-closer"
                  aria-label="Filtrar por closer"
                >
                  <SelectValue placeholder="Todos los closers" />
                </SelectTrigger>
                <SelectContent className={styles.overlayTheme}>
                  <SelectGroup>
                    <SelectItem value="all">Todos los closers</SelectItem>
                    {closers.map((closer) => (
                      <SelectItem key={closer.id} value={closer.id}>
                        {closer.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="agenda-closer-outcome">
                ¿Qué sucedió?
              </FieldLabel>
              <Select
                value={closerOutcomeFilter}
                onValueChange={(value) =>
                  setCloserOutcomeFilter(
                    (value ?? "all") as CloserOutcomeFilter,
                  )
                }
              >
                <SelectTrigger
                  id="agenda-closer-outcome"
                  aria-label="Filtrar por lo que sucedió"
                >
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className={styles.overlayTheme}>
                  <SelectGroup>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="none">Sin feedback</SelectItem>
                    {CLOSER_OUTCOMES.map((outcome) => (
                      <SelectItem key={outcome} value={outcome}>
                        {outcome}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="agenda-date-from">Desde</FieldLabel>
              <Input
                id="agenda-date-from"
                type="date"
                value={dateRange.from}
                max={dateRange.to || undefined}
                onChange={(event) =>
                  setDateRange((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="agenda-date-to">Hasta</FieldLabel>
              <Input
                id="agenda-date-to"
                type="date"
                value={dateRange.to}
                min={dateRange.from || undefined}
                onChange={(event) =>
                  setDateRange((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
            </Field>

            <Field>
              <FieldLabel>Accesos rápidos</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    dateRange.from === today && dateRange.to === today
                      ? "default"
                      : "outline"
                  }
                  onClick={() => selectQuickDate(today)}
                >
                  Hoy
                </Button>
                <Button
                  type="button"
                  variant={
                    dateRange.from === tomorrow && dateRange.to === tomorrow
                      ? "default"
                      : "outline"
                  }
                  onClick={() => selectQuickDate(tomorrow)}
                >
                  Mañana
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agendas vigentes</CardTitle>
          <CardDescription>
            {filteredAgendaLeads.length === 1
              ? "1 agenda encontrada"
              : `${filteredAgendaLeads.length} agendas encontradas`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="min-w-0 overflow-x-auto">
            {filteredAgendaLeads.length === 0 ? (
              <Empty heading="No hay agendas para estos filtros" />
            ) : (
              <DataTable
                data={filteredAgendaLeads}
                columns={agendaColumns}
                getRowId={(row) => row.id}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgendaHeading() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className={styles.heading}>Agendas</h1>
      <p className={cn(styles.subtitle, "text-muted-foreground")}>
        Consulta, filtra y actualiza las reuniones programadas.
      </p>
    </div>
  );
}
