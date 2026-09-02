"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { usePermissions } from "@crm-fran/ui/permissions";

import { trpc } from "@/utils/trpc";

type QueueStatus = "pending" | "sent";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(date: Date) {
  return dayFormatter.format(date);
}

function defaultFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return dayKey(date);
}

export function WhatsappQueue() {
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const canMarkSent = permissions.includes("*")
    || permissions.includes("leads:*")
    || permissions.includes("leads:write");
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => dayKey(new Date()));
  const [callerId, setCallerId] = useState("all");
  const input = {
    status,
    from,
    to,
    callerId: callerId === "all" ? undefined : callerId,
  };
  const queue = useQuery(trpc.whatsapp.list.queryOptions(input));
  const markSent = useMutation(trpc.whatsapp.markSent.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.whatsapp.list.queryKey() });
      toast.success(status === "pending" ? "Marcado como enviado" : "Devuelto a pendientes");
    },
    onError: (error) => toast.error(error.message),
  }));
  const rows = queue.data?.rows ?? [];
  const callers = queue.data?.callers ?? [];

  const content = queue.isLoading
    ? <div className="grid gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
    : rows.length === 0
      ? <Empty heading={status === "pending" ? "No quedan envíos pendientes" : "No hay envíos en este intervalo"} description="Prueba con otro intervalo o caller." />
      : <>
          <div className="grid gap-2 md:hidden">
            {rows.map((row) => <QueueCard key={row.id} row={row} disabled={!canMarkSent || markSent.isPending} onChange={(sent) => markSent.mutate({ leadId: row.id, sent })} />)}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Teléfono</TableHead><TableHead>Caller</TableHead><TableHead>Fecha</TableHead><TableHead className="w-24 text-center">Enviado</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.phone}</TableCell><TableCell>{row.caller?.name ?? "Sin caller"}</TableCell><TableCell>{new Date(row.queueDate!).toLocaleDateString("es-ES")}</TableCell><TableCell className="text-center"><Checkbox aria-label={`Marcar ${row.name} como enviado`} checked={row.whatsappSentAt !== null} disabled={!canMarkSent || markSent.isPending} onCheckedChange={(sent) => markSent.mutate({ leadId: row.id, sent })} /></TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </>;

  return (
    <main className="flex w-full flex-col gap-4 p-4 md:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2"><div className="rounded-md bg-primary/10 p-2 text-primary"><CheckIcon className="size-4" /></div><h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1></div>
        <p className="text-sm text-muted-foreground">Leads con 3 impactos telefónicos sin contacto.</p>
      </header>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3"><CardTitle>Filtros</CardTitle><CardDescription>Selecciona únicamente el intervalo y el caller.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-3 sm:grid-cols-3">
            <Field><FieldLabel htmlFor="whatsapp-from">Desde</FieldLabel><Input id="whatsapp-from" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="whatsapp-to">Hasta</FieldLabel><Input id="whatsapp-to" type="date" value={to} min={from} max={dayKey(new Date())} onChange={(event) => setTo(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="whatsapp-caller">Caller</FieldLabel><Select value={callerId} onValueChange={(value) => setCallerId(value ?? "all")}><SelectTrigger id="whatsapp-caller"><SelectValue>{callerId === "all" ? "Todos los callers" : callers.find((caller) => caller.id === callerId)?.name}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todos los callers</SelectItem>{callers.map((caller) => <SelectItem key={caller.id} value={caller.id}>{caller.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Tabs value={status} onValueChange={(value) => setStatus(value as QueueStatus)}>
        <TabsList className="w-full sm:w-fit"><TabsTrigger value="pending">Pendientes</TabsTrigger><TabsTrigger value="sent">Enviados</TabsTrigger></TabsList>
        <TabsContent value="pending"><Card className="rounded-xl shadow-sm"><CardContent className="pt-5">{content}</CardContent></Card></TabsContent>
        <TabsContent value="sent"><Card className="rounded-xl shadow-sm"><CardContent className="pt-5">{content}</CardContent></Card></TabsContent>
      </Tabs>
    </main>
  );
}

function QueueCard(props: {
  row: {
    id: string;
    name: string;
    phone: string;
    caller: { id: string | null; name: string | null } | null;
    queueDate: string | null;
    whatsappSentAt: string | null;
  };
  disabled: boolean;
  onChange: (sent: boolean) => void;
}) {
  return <label className="flex min-h-16 items-center justify-between gap-3 rounded-lg border p-3"><span className="min-w-0"><span className="block truncate font-medium">{props.row.name}</span><span className="block text-xs text-muted-foreground">{props.row.phone} · {props.row.caller?.name ?? "Sin caller"} · {props.row.queueDate ? new Date(props.row.queueDate).toLocaleDateString("es-ES") : "—"}</span></span><Checkbox aria-label={`Marcar ${props.row.name} como enviado`} checked={props.row.whatsappSentAt !== null} disabled={props.disabled} onCheckedChange={props.onChange} /></label>;
}
