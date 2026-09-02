"use client";
import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { DataTable } from "@crm-fran/ui/components/data-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Badge } from "@crm-fran/ui/components/badge";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { createLeadColumns } from "@/features/table/columns";
import LeadViewDrawer from "@/features/leads/lead-view-drawer";
import AssignLeadDrawer from "@/features/leads/assign-lead-drawer";
import { getCallerResponseStatus } from "@/features/leads/response-status";
import { CALLER_FEEDBACK_OPTIONS, matchesCallerFeedbackFilter, type CallerFeedbackFilter } from "@/features/leads/caller-feedback";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";

type DateField = "createdAt" | "updatedAt";
type CloserFilter = "all" | string;
type ResponseFilter = "all" | "Si" | "No" | "Sin asignar";

function parseLocalDate(isoDate: string | undefined, endOfDay = false) {
  if (!isoDate) return undefined;

  const parts = isoDate.split("-");
  if (parts.length !== 3) return undefined;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }

  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

type LeadType = "maestra" | "vsl";

export function AssignedLeadsTable({
  type,
  title,
  description,
  assignedOnly = false,
  overlayClassName,
}: {
  type: LeadType;
  title: string;
  description: string;
  assignedOnly?: boolean;
  overlayClassName?: string;
}) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [dateRange, setDateRange] = useState<{
    from?: string;
    to?: string;
  }>();
  const [dateField, setDateField] = useState<DateField>("createdAt");
  const [selectedCloserId, setSelectedCloserId] = useState<CloserFilter>("all");
  const [selectedResponse, setSelectedResponse] =
    useState<ResponseFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedFeedback, setSelectedFeedback] = useState<CallerFeedbackFilter>("all");

  const isAdmin = session?.user?.roleId === "role-admin";

  // Both queries return the same data shape; only one is enabled at a time
  const allLeadsQuery = useQuery({
    ...trpc.leads.listAll.queryOptions(),
    enabled: !isSessionPending && !!session && isAdmin,
  });

  const userLeadsQuery = useQuery({
    ...trpc.leads.listByUserId.queryOptions(),
    enabled: !isSessionPending && !!session && !isAdmin,
  });

  const rawLeads = isAdmin ? allLeadsQuery.data : userLeadsQuery.data;
  const activeQuery = isAdmin ? allLeadsQuery : userLeadsQuery;
  const leads = rawLeads?.filter(
    (lead) =>
      lead.type === type &&
      (!assignedOnly || lead.callerId !== null || lead.closerId !== null),
  );
  const availableClosers = Array.from(
    new Map(
      leads?.flatMap((lead) =>
        lead.closerId === null
          ? []
          : [[lead.closerId, lead.closer?.name ?? "Sin asignar"]]
      ) ?? []
    ),
  ).map(([id, name]) => ({ id, name }));
  const availableCloserIds = availableClosers.map(({ id }) => id);
  const activeCloserId =
    selectedCloserId === "all" || availableCloserIds.includes(selectedCloserId)
      ? selectedCloserId
      : "all";
  const activeCloserName =
    activeCloserId === "all"
      ? "Todos los closers"
      : availableClosers.find(({ id }) => id === activeCloserId)?.name ?? "Sin asignar";
  useEffect(() => {
    if (selectedCloserId !== "all" && !availableCloserIds.includes(selectedCloserId)) {
      setSelectedCloserId("all");
    }
  }, [availableCloserIds, selectedCloserId]);
  const fromDate = parseLocalDate(dateRange?.from);
  const toDate = parseLocalDate(dateRange?.to, true);
  const filteredLeads = leads?.filter((lead) => {
    let matchesDate = true;
    if (fromDate || toDate) {
      const leadDate = new Date(lead[dateField]);
      matchesDate =
        !Number.isNaN(leadDate.getTime()) &&
        (!fromDate || leadDate >= fromDate) &&
        (!toDate || leadDate <= toDate);
    }
    const matchesCloser = activeCloserId === "all" || lead.closerId === activeCloserId;
    const matchesResponse =
      selectedResponse === "all" ||
      getCallerResponseStatus(lead.questions) === selectedResponse;

    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    const matchesSearch = normalizedSearch.length === 0 || [
      lead.name,
      lead.email,
      lead.phone,
      lead.state,
      lead.caller?.name,
      lead.closer?.name,
    ].some((value) => value?.toLocaleLowerCase("es").includes(normalizedSearch));

    const matchesFeedback = matchesCallerFeedbackFilter(lead.questions, selectedFeedback);

    return matchesDate && matchesCloser && matchesResponse && matchesFeedback && matchesSearch;
  });

  const summary = {
    total: leads?.length ?? 0,
    caller: leads?.filter(({ callerId }) => Boolean(callerId)).length ?? 0,
    closer: leads?.filter(({ closerId }) => Boolean(closerId)).length ?? 0,
    answered: leads?.filter(({ questions }) => getCallerResponseStatus(questions) === "Si").length ?? 0,
  };

  const columns = createLeadColumns((lead) => (
    <div className="flex gap-2">
      <LeadViewDrawer lead={lead} />
      <AssignLeadDrawer lead={lead} />
    </div>
  ));

  if (isSessionPending || activeQuery.isLoading) {
    return <main className="dashboard-arc-theme flex flex-col gap-4 bg-background p-4 sm:p-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></main>;
  }

  if (activeQuery.isError) {
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><Empty heading="No se pudieron cargar los leads personales" description="Reintenta cuando vuelva la conexión. Tus filtros y asignaciones no se han modificado." /></main>;
  }

  return (
    <main className="dashboard-arc-theme flex min-h-full w-full min-w-0 flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 data-slot="assigned-leads-heading" className="text-3xl font-bold tracking-tight">
          {title}
          </h1>
          <Badge variant="outline">{isAdmin ? "Supervisión" : "Mi cartera"}</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </header>

      <section aria-label="Resumen de leads personales" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Leads visibles", summary.total],
          ["Con caller", summary.caller],
          ["Con closer", summary.closer],
          ["Con respuesta", summary.answered],
        ].map(([label, value]) => (
          <Card size="sm" key={String(label)}>
            <CardHeader className="pb-1"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader>
          </Card>
        ))}
      </section>

      <Card size="sm">
        <CardHeader className="pb-2">
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Combina búsqueda, fecha, closer y respuesta sin alterar tu selección.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div
            data-slot="assigned-lead-filters"
            className="grid gap-3 px-4 md:grid-cols-2 lg:px-6 xl:grid-cols-[minmax(16rem,1.5fr)_repeat(5,minmax(10rem,1fr))] xl:items-end"
          >
            <Field>
              <FieldLabel htmlFor="personal-leads-search">Buscar</FieldLabel>
              <div className="relative">
                <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="personal-leads-search" aria-label="Buscar leads personales" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, correo, teléfono o responsable" className="h-11 pl-9" />
              </div>
            </Field>
            <DateRangePicker
              from={dateRange?.from}
              to={dateRange?.to}
              onChange={setDateRange}
            />
            <Select
              value={dateField}
              onValueChange={(value) => {
                if (value === "createdAt" || value === "updatedAt") {
                  setDateField(value);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-11 w-full min-w-0"
                aria-label="Campo de fecha para filtrar"
              >
                <SelectValue>
                  {dateField === "createdAt"
                    ? "Fecha de creación"
                    : "Fecha de actualización"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className={overlayClassName}>
                <SelectGroup>
                  <SelectItem value="createdAt">Fecha de creación</SelectItem>
                  <SelectItem value="updatedAt">Fecha de actualización</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={activeCloserId}
              onValueChange={(value) => setSelectedCloserId(value ?? "all")}
            >
              <SelectTrigger
                size="sm"
                className="h-11 w-full min-w-0"
                aria-label="Closer para filtrar"
              >
                <SelectValue>{activeCloserName}</SelectValue>
              </SelectTrigger>
              <SelectContent className={overlayClassName}>
                <SelectGroup>
                  <SelectItem value="all">Todos los closers</SelectItem>
                  {availableClosers.map(({ id, name }) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={selectedResponse}
              onValueChange={(value) => {
                if (
                  value === "all" ||
                  value === "Si" ||
                  value === "No" ||
                  value === "Sin asignar"
                ) {
                  setSelectedResponse(value);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-11 w-full min-w-0"
                aria-label="Respuesta para filtrar"
              >
                <SelectValue>
                  {selectedResponse === "all"
                    ? "Todas las respuestas"
                    : selectedResponse}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className={overlayClassName}>
                <SelectGroup>
                  <SelectItem value="all">Todas las respuestas</SelectItem>
                  <SelectItem value="Si">Si</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Sin asignar">Sin asignar</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Field>
              <FieldLabel>Tipo de feedback</FieldLabel>
              <Select
              value={selectedFeedback}
              onValueChange={(value) => {
                if (value === "all" || value === "none" || CALLER_FEEDBACK_OPTIONS.some((option) => option.value === value)) {
                  setSelectedFeedback(value as CallerFeedbackFilter);
                }
              }}
              >
                <SelectTrigger size="sm" className="h-11 w-full min-w-0" aria-label="Tipo de feedback">
                <SelectValue>
                  {selectedFeedback === "all"
                    ? "Todos los feedbacks"
                    : selectedFeedback === "none"
                      ? "Sin feedback"
                      : CALLER_FEEDBACK_OPTIONS.find(({ value }) => value === selectedFeedback)?.label}
                </SelectValue>
                </SelectTrigger>
                <SelectContent className={overlayClassName}>
                  <SelectGroup>
                    <SelectItem value="all">Todos los feedbacks</SelectItem>
                    <SelectItem value="none">Sin feedback</SelectItem>
                    {CALLER_FEEDBACK_OPTIONS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle>Leads asignados</CardTitle>
          <CardDescription>
            {filteredLeads?.length === 1
              ? "1 lead encontrado"
              : `${filteredLeads?.length ?? 0} leads encontrados`}. Acciones disponibles según tus permisos y tu rol operativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {filteredLeads?.length === 0 ? (
            <Empty heading={leads?.length === 0 ? "Todavía no tienes leads asignados" : "Ningún lead coincide con los filtros"} description={leads?.length === 0 ? "Cuando recibas una asignación aparecerá aquí, sin mezclar la cartera de otros usuarios." : "Prueba a ampliar el intervalo o limpiar alguno de los filtros."} />
          ) : (
          <div className="max-h-[36rem] min-w-0 overflow-auto border-t">
            <DataTable
              data={filteredLeads ?? []}
              columns={columns}
              getRowId={(row) => row.id}
            />
          </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
