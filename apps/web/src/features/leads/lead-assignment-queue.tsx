"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchIcon, UserRoundPlus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { cn } from "@crm-fran/ui/lib/utils";
import { DataTable } from "@crm-fran/ui/components/data-table";
import {
  Card,
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
import { Field, FieldLabel } from "@crm-fran/ui/components/field";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@crm-fran/ui/components/tabs";

import AssignLeadButton from "@/components/assign-lead-button";
import AssignLeadDrawer, { type Lead } from "@/features/leads/assign-lead-drawer";
import { createLeadColumns } from "@/features/table/columns";
import { splitDiscardedLeads } from "@/features/leads/lead-pool";
import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { trpc } from "@/utils/trpc";

type LeadType = "maestra" | "vsl";

export function LeadAssignmentQueue({
  type,
  title,
  description,
  overlayClassName,
}: {
  type: LeadType;
  title: string;
  description: string;
  overlayClassName?: string;
}) {
  const [feedbackLead, setFeedbackLead] = useState<Lead | null>(null);
  const newLeads = useQuery(
    trpc.leads.listWithoutAssigned.queryOptions({ type, poolStatus: "new" }),
  );
  const recoveredLeads = useQuery(
    {
      ...trpc.leads.listWithoutAssigned.queryOptions({
        type,
        poolStatus: "recovered",
      }),
      enabled: newLeads.isSuccess,
    },
  );
  const discardedLeads = useQuery(
    {
      ...trpc.leads.listWithoutAssigned.queryOptions({
        type,
        poolStatus: "discarded",
      }),
      enabled: recoveredLeads.isSuccess,
    },
  );
  const availableColumns = createLeadColumns(
    (lead) => (
      <div className="flex items-center gap-2">
        <LeadTypeSelect
          leadId={lead.id}
          type={lead.type}
          overlayClassName={overlayClassName}
        />
        <AssignLeadDialog lead={lead} onAssigned={setFeedbackLead} />
      </div>
    ),
    { variant: "available" },
  );
  const recoveredColumns = createLeadColumns(
    (lead) => (
      <div className="flex items-center gap-2">
        <LeadTypeSelect
          leadId={lead.id}
          type={lead.type}
          overlayClassName={overlayClassName}
        />
        <AssignLeadDialog lead={lead} onAssigned={setFeedbackLead} />
      </div>
    ),
    { variant: "available", showRecoveryProgress: true },
  );
  const discardedColumns = createLeadColumns(() => null, {
    variant: "available",
    showRecoveryProgress: true,
    readOnly: true,
  });
  const wrongNumberColumns = createLeadColumns(() => null, {
    variant: "available",
    readOnly: true,
  });
  const discardedGroups = splitDiscardedLeads(discardedLeads.data ?? []);
  const isVsl = type === "vsl";
  const summaryItems = isVsl
    ? [
        { label: "Nuevos", value: newLeads.data?.length ?? 0 },
        { label: "Por contactar", value: recoveredLeads.data?.length ?? 0 },
        { label: "3 impactos", value: discardedGroups.threeImpacts.length },
        { label: "Número erróneo", value: discardedGroups.wrongNumbers.length },
      ]
    : [
        { label: "Nuevos", value: newLeads.data?.length ?? 0 },
        { label: "Por contactar", value: recoveredLeads.data?.length ?? 0 },
        { label: "Descartados", value: discardedLeads.data?.length ?? 0 },
      ];

  return (
    <section className="dashboard-arc-theme flex min-h-full w-full min-w-0 flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 data-slot="lead-queue-heading" className="text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </header>

      <section
        aria-label="Resumen de pools de leads"
        className={cn(
          "grid gap-3",
          isVsl ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3",
        )}
      >
        {summaryItems.map((item) => (
          <Card size="sm" key={item.label}><CardHeader className="pb-1"><CardDescription>{item.label}</CardDescription><CardTitle className="text-2xl">{item.value}</CardTitle></CardHeader></Card>
        ))}
      </section>

      <Tabs defaultValue="new">
        <TabsList className="flex h-auto w-fit max-w-full flex-nowrap gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
          <TabsTrigger value="new" className="h-11! min-h-11! data-active:bg-background">
            Nuevos <Badge variant="secondary">{newLeads.data?.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="recovered" className="h-11! min-h-11! data-active:bg-background">
            Por contactar
            <Badge variant="secondary">{recoveredLeads.data?.length ?? 0}</Badge>
          </TabsTrigger>
          {isVsl ? (
            <>
              <TabsTrigger value="three-impacts" className="h-11! min-h-11! data-active:bg-background">
                3 impactos
                <Badge variant="secondary">{discardedGroups.threeImpacts.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="wrong-number" className="h-11! min-h-11! data-active:bg-background">
                Número erróneo
                <Badge variant="secondary">{discardedGroups.wrongNumbers.length}</Badge>
              </TabsTrigger>
            </>
          ) : (
            <TabsTrigger value="discarded" className="h-11! min-h-11! data-active:bg-background">
              Descartados
              <Badge variant="secondary">{discardedLeads.data?.length ?? 0}</Badge>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="new">
          <LeadPoolCard
            title="Leads nuevos"
            description="Leads que todavía no han sido trabajados"
            emptyHeading="No hay leads nuevos"
            type={type}
            poolStatus="new"
            query={newLeads}
            columns={availableColumns}
          />
        </TabsContent>
        <TabsContent value="recovered">
          <LeadPoolCard
            title="Leads por contactar"
            description="Leads liberados después de vencer un intento de contacto"
            emptyHeading="No hay leads por contactar"
            type={type}
            poolStatus="recovered"
            query={recoveredLeads}
            columns={recoveredColumns}
          />
        </TabsContent>
        {isVsl ? (
          <>
            <TabsContent value="three-impacts">
              <LeadPoolCard
                title="Leads con 3 impactos"
                description="Leads que agotaron sus tres intentos de contacto"
                emptyHeading="No hay leads con 3 impactos"
                type={type}
                poolStatus="discarded"
                viewKey="three-impacts"
                query={{ ...discardedLeads, data: discardedGroups.threeImpacts }}
                columns={discardedColumns}
              />
            </TabsContent>
            <TabsContent value="wrong-number">
              <LeadPoolCard
                title="Números erróneos"
                description="Leads cuyo número de teléfono no existe"
                emptyHeading="No hay números erróneos"
                type={type}
                poolStatus="discarded"
                viewKey="wrong-number"
                query={{ ...discardedLeads, data: discardedGroups.wrongNumbers }}
                columns={wrongNumberColumns}
              />
            </TabsContent>
          </>
        ) : (
          <TabsContent value="discarded">
            <LeadPoolCard
              title="Leads descartados"
              description="Leads que agotaron sus tres intentos de contacto"
              emptyHeading="No hay leads descartados"
              type={type}
              poolStatus="discarded"
              query={discardedLeads}
              columns={discardedColumns}
            />
          </TabsContent>
        )}
      </Tabs>

      {feedbackLead && (
        <AssignLeadDrawer
          key={feedbackLead.id}
          lead={feedbackLead}
          mode="post-assignment-feedback"
          defaultOpen
          hideTrigger
        />
      )}
    </section>
  );
}

type PoolQuery = {
  data?: Array<{ id: string; name?: string; email?: string | null; phone?: string; state?: string; noContactImpactCount?: number; createdAt?: Date | string; updatedAt?: Date | string }>;
  isLoading: boolean;
  isError: boolean;
};

function LeadPoolCard({
  title,
  description,
  emptyHeading,
  type,
  poolStatus,
  viewKey,
  query,
  columns,
}: {
  title: string;
  description: string;
  emptyHeading: string;
  type: LeadType;
  poolStatus: "new" | "recovered" | "discarded";
  viewKey?: string;
  query: PoolQuery;
  columns: ColumnDef<any>[];
}) {
  const [search, setSearch] = useState("");
  const count = query.data?.length ?? 0;
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredLeads = normalizedSearch
    ? query.data?.filter((lead) => [lead.name, lead.email, lead.phone, lead.state].some((value) => value?.toLocaleLowerCase("es").includes(normalizedSearch))) ?? []
    : query.data ?? [];

  return (
    <Card size="sm">
      <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1"><CardTitle>{title}</CardTitle><CardDescription>{description}. {count === 1 ? "1 lead" : `${count} leads`}.</CardDescription></div>
        <Field className="w-full sm:w-72">
          <FieldLabel htmlFor={`lead-pool-search-${viewKey ?? poolStatus}`}>Buscar leads</FieldLabel>
          <div className="relative"><SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id={`lead-pool-search-${viewKey ?? poolStatus}`} className="h-11 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, correo, teléfono o estado" /></div>
        </Field>
      </CardHeader>
      <CardContent className="px-0">
        {query.isLoading ? (
          <div className="flex flex-col gap-3 px-4 lg:px-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        ) : query.isError ? (
          <div className="px-4 lg:px-6"><Empty heading="Error al cargar los leads" description="Reintenta cuando vuelva la conexión." /></div>
        ) : query.data?.length && filteredLeads.length ? (
          <div className="max-h-[36rem] min-w-0 overflow-auto">
            <DataTable
              key={`${viewKey ?? poolStatus}-${type}-${columns.length}`}
              data={filteredLeads}
              columns={columns}
              getRowId={(row) => row.id}
            />
          </div>
        ) : (
          <div className="px-4 lg:px-6">
            <Empty heading={search && query.data?.length ? "Sin coincidencias" : emptyHeading} description={search && query.data?.length ? "No hay leads que coincidan con la búsqueda." : undefined} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadTypeSelect({
  leadId,
  type,
  overlayClassName,
}: {
  leadId: string;
  type: LeadType;
  overlayClassName?: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useTrpcMutationWithToast(
    trpc.leads.setType.mutationOptions(),
    {
      success: "Tipo de lead actualizado",
      error: "No se pudo actualizar el tipo del lead",
    },
  );

  return (
    <Select
      value={type}
      disabled={mutation.isPending}
      onValueChange={(value) => {
        if (value !== "maestra" && value !== "vsl") return;
        mutation.mutate(
          { id: leadId, type: value },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: trpc.leads.listWithoutAssigned.queryKey(),
              });
              queryClient.invalidateQueries({
                queryKey: trpc.leads.listAll.queryKey(),
              });
              queryClient.invalidateQueries({
                queryKey: trpc.leads.listByUserId.queryKey(),
              });
            },
          },
        );
      }}
    >
      <SelectTrigger aria-label="Cambiar tipo de lead">
        <SelectValue>{type === "vsl" ? "VSL" : "Maestra"}</SelectValue>
      </SelectTrigger>
      <SelectContent className={overlayClassName}>
        <SelectGroup>
          <SelectItem value="maestra">Maestra</SelectItem>
          <SelectItem value="vsl">VSL</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function AssignLeadDialog({
  lead,
  onAssigned,
}: {
  lead: Lead;
  onAssigned: (lead: Lead) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" aria-label="Asignarme este lead">
            <UserRoundPlus data-icon="inline-start" />
            Asignarme
          </Button>
        }
      />
      <DialogContent className="dashboard-arc-theme sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar asignación</DialogTitle>
          <DialogDescription>
            ¿Quieres asignarte este lead para comenzar a trabajarlo?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancelar
          </DialogClose>
          <AssignLeadButton
            leadId={lead.id}
            closeDialog={() => setOpen(false)}
            onSuccess={() => onAssigned(lead)}
          >
            Confirmar
          </AssignLeadButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
