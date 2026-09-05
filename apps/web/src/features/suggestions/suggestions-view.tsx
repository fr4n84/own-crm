"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Field, FieldLabel } from "@crm-fran/ui/components/field";
import { Textarea } from "@crm-fran/ui/components/textarea";
import { usePermissions } from "@crm-fran/ui/permissions";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

export function SuggestionsView() {
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const permissions = usePermissions();
  const isAdmin = permissions.includes("*");
  const queryClient = useQueryClient();
  const list = useQuery({ ...trpc.suggestions.list.queryOptions(), enabled: isAdmin });
  const create = useMutation(trpc.suggestions.create.mutationOptions({
    onSuccess: async () => {
      setBody("");
      setAnonymous(false);
      toast.success("Sugerencia enviada");
      if (isAdmin) await queryClient.invalidateQueries({ queryKey: trpc.suggestions.list.queryKey() });
    },
    onError: (error) => toast.error(error.message),
  }));

  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <Card>
      <CardHeader><CardTitle>Enviar una sugerencia</CardTitle><CardDescription>Comparte una mejora para el CRM. Puedes identificarte o enviarla de forma realmente anónima.</CardDescription></CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); create.mutate({ body, anonymous }); }}>
          <Field><FieldLabel htmlFor="suggestion-body">Sugerencia</FieldLabel><Textarea id="suggestion-body" maxLength={4000} required value={body} onChange={(event) => setBody(event.target.value)} className="min-h-32" /><p className="text-xs text-muted-foreground">{body.length}/4000</p></Field>
          <Field className="flex-row items-center"><Checkbox id="suggestion-anonymous" checked={anonymous} onCheckedChange={setAnonymous} /><FieldLabel htmlFor="suggestion-anonymous">Enviar de forma anónima</FieldLabel></Field>
          <Button className="self-start" disabled={create.isPending || body.trim().length === 0} type="submit">{create.isPending ? "Enviando…" : "Enviar sugerencia"}</Button>
        </form>
      </CardContent>
    </Card>
    {isAdmin && <Card><CardHeader><CardTitle>Sugerencias registradas</CardTitle><CardDescription>Solo la administración puede consultar este registro.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
      {list.isLoading ? <p role="status">Cargando sugerencias…</p> : list.isError ? <p role="alert">No se pudieron cargar las sugerencias.</p> : list.data?.length ? list.data.map((item) => <article key={item.id} className="rounded-lg border p-4"><p className="whitespace-pre-wrap text-sm">{item.body}</p><p className="mt-2 text-xs text-muted-foreground">{item.isAnonymous ? "Anónima" : item.author ? `${item.author.name} · ${item.author.email}` : "Usuario eliminado"} · {new Date(item.createdAt).toLocaleString()}</p></article>) : <p className="text-sm text-muted-foreground">Aún no hay sugerencias.</p>}
    </CardContent></Card>}
  </main>;
}
