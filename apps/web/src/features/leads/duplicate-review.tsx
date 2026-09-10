"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { trpc } from "@/utils/trpc";

const labels = { exact_email: "Mismo correo", exact_phone: "Mismo teléfono", similar_name: "Nombre parecido" } as const;

export function DuplicateReview() {
  const client = useQueryClient();
  const cases = useQuery(trpc.leads.duplicateCases.queryOptions());
  const refresh = () => client.invalidateQueries({ queryKey: trpc.leads.duplicateCases.queryKey() });
  const merge = useMutation(trpc.leads.mergeDuplicate.mutationOptions({ onSuccess: async () => { await refresh(); toast.success("Leads fusionados con trazabilidad"); }, onError: (error) => toast.error(error.message) }));
  const dismiss = useMutation(trpc.leads.dismissDuplicate.mutationOptions({ onSuccess: async () => { await refresh(); toast.success("Coincidencia descartada"); }, onError: (error) => toast.error(error.message) }));
  const pending = merge.isPending || dismiss.isPending;
  return <Card><CardHeader><CardTitle>Posibles duplicados</CardTitle><CardDescription>Revisión administrativa. Un teléfono o correo compartido nunca fusiona automáticamente.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
    {cases.isLoading ? <p role="status">Buscando coincidencias…</p> : cases.isError ? <p role="alert">No se pudieron cargar las coincidencias.</p> : cases.data?.length ? cases.data.map((item) => <article className="grid gap-3 rounded-lg border p-4" key={item.id}>
      <div className="flex flex-wrap gap-2">{item.reasons.map((reason) => <Badge variant="secondary" key={reason}>{labels[reason]}</Badge>)}<Badge variant="outline">Nombre {item.nameSimilarity}%</Badge></div>
      <div className="grid gap-3 md:grid-cols-2">{[item.leadA, item.leadB].map((lead) => <section className="rounded-md bg-muted/50 p-3" key={lead.id}><p className="font-medium">{lead.name}</p><p className="text-sm text-muted-foreground">{lead.email ?? "Sin correo"}</p><p className="text-sm text-muted-foreground">{lead.phone}</p><Button className="mt-3 w-full" disabled={pending} onClick={() => merge.mutate({ caseId: item.id, canonicalLeadId: lead.id })}>Conservar como principal</Button></section>)}</div>
      <Button variant="outline" disabled={pending} onClick={() => dismiss.mutate({ caseId: item.id })}>No son la misma persona</Button>
    </article>) : <p className="text-sm text-muted-foreground">No hay coincidencias pendientes.</p>}
  </CardContent></Card>;
}
