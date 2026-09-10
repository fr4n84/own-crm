"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@crm-fran/ui/components/toggle-group";
import { trpc } from "@/utils/trpc";

const labels = { exact_email: "Mismo correo", exact_phone: "Mismo teléfono", similar_name: "Nombre parecido" } as const;
const pageSize = 20;

type DuplicateCursor = {
  createdAt: string;
  id: string;
};

type BatchResult =
  | { caseId: string; status: "merged" }
  | { caseId: string; status: "failed"; message: string };

export function DuplicateReview() {
  const client = useQueryClient();
  const [cursorHistory, setCursorHistory] = useState<Array<DuplicateCursor | null>>([null]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [canonicalLeadIds, setCanonicalLeadIds] = useState<Record<string, string>>({});
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const cursor = cursorHistory.at(-1) ?? null;
  const cases = useQuery(trpc.leads.duplicateCases.queryOptions({ pageSize, ...(cursor ? { cursor } : {}) }));
  const refresh = () => client.invalidateQueries({ queryKey: trpc.leads.duplicateCases.queryKey() });

  const clearPageState = () => {
    setSelectedCaseIds([]);
    setCanonicalLeadIds({});
    setBatchResults([]);
  };

  const mergeBatch = useMutation(trpc.leads.mergeDuplicateBatch.mutationOptions({
    onSuccess: async (results) => {
      const failedResults = results.filter((result) => result.status === "failed");
      const failedCaseIds = new Set(failedResults.map((result) => result.caseId));
      setBatchResults(results);
      setSelectedCaseIds([...failedCaseIds]);
      setCanonicalLeadIds((current) => Object.fromEntries(
        Object.entries(current).filter(([caseId]) => failedCaseIds.has(caseId)),
      ));

      const mergedCount = results.length - failedResults.length;
      if (mergedCount > 0) {
        toast.success(`${mergedCount} ${mergedCount === 1 ? "caso fusionado" : "casos fusionados"} con trazabilidad`);
      }
      if (failedResults.length > 0) {
        toast.error(`${failedResults.length} ${failedResults.length === 1 ? "caso no se pudo fusionar" : "casos no se pudieron fusionar"}`);
      }
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  }));

  const dismiss = useMutation(trpc.leads.dismissDuplicate.mutationOptions({
    onSuccess: async (_result, variables) => {
      setSelectedCaseIds((current) => current.filter((caseId) => caseId !== variables.caseId));
      setCanonicalLeadIds((current) => {
        const next = { ...current };
        delete next[variables.caseId];
        return next;
      });
      await refresh();
      toast.success("Coincidencia descartada");
    },
    onError: (error) => toast.error(error.message),
  }));

  const pending = mergeBatch.isPending || dismiss.isPending;
  const rows = cases.data?.items ?? [];
  const selectedEntries = rows.flatMap((item) => {
    if (!selectedCaseIds.includes(item.id)) return [];
    const canonicalLeadId = canonicalLeadIds[item.id];
    return canonicalLeadId ? [{ caseId: item.id, canonicalLeadId }] : [];
  });
  const canMergeSelected = selectedCaseIds.length > 0 && selectedEntries.length === selectedCaseIds.length;

  const selectCase = (caseId: string, isSelected: boolean) => {
    setSelectedCaseIds((current) => isSelected
      ? [...current, caseId]
      : current.filter((selectedId) => selectedId !== caseId));
  };

  const goToNextPage = () => {
    if (!cases.data?.nextCursor) return;
    setCursorHistory((current) => [...current, cases.data.nextCursor]);
    clearPageState();
  };

  const goToPreviousPage = () => {
    if (cursorHistory.length === 1) return;
    setCursorHistory((current) => current.slice(0, -1));
    clearPageState();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posibles duplicados</CardTitle>
        <CardDescription>
          Cuando nombre, teléfono y correo coinciden exactamente y hay un único candidato, el CRM fusiona automáticamente solo si todas las guardas lo permiten. El resto permanece aquí para revisión manual.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {batchResults.length > 0 ? (
          <ul aria-label="Resultados de la fusión" className="grid gap-1 rounded-lg border p-3 text-sm">
            {batchResults.map((result) => (
              <li key={result.caseId}>
                {result.caseId}: {result.status === "merged" ? "Fusionado correctamente" : result.message}
              </li>
            ))}
          </ul>
        ) : null}

        {cases.isLoading ? (
          <p role="status">Buscando coincidencias…</p>
        ) : cases.isError ? (
          <p role="alert">No se pudieron cargar las coincidencias.</p>
        ) : rows.length > 0 ? rows.map((item) => {
          const selectedCanonical = canonicalLeadIds[item.id];
          return (
            <article className="grid gap-3 rounded-lg border p-4" key={item.id}>
              <div className="flex min-h-11 items-center gap-3 font-medium">
                <Checkbox
                  aria-label={`Seleccionar caso ${item.leadA.name} y ${item.leadB.name}`}
                  checked={selectedCaseIds.includes(item.id)}
                  disabled={pending}
                  onCheckedChange={(checked) => selectCase(item.id, checked)}
                />
                Seleccionar este caso
              </div>
              <div className="flex flex-wrap gap-2">
                {item.reasons.map((reason) => <Badge variant="secondary" key={reason}>{labels[reason]}</Badge>)}
                <Badge variant="outline">Nombre {item.nameSimilarity}%</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[item.leadA, item.leadB].map((lead) => (
                  <section className="rounded-md bg-muted/50 p-3" key={lead.id}>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-sm text-muted-foreground">{lead.email ?? "Sin correo"}</p>
                    <p className="text-sm text-muted-foreground">{lead.phone}</p>
                  </section>
                ))}
              </div>
              <ToggleGroup
                aria-label={`Lead principal para ${item.leadA.name} y ${item.leadB.name}`}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                disabled={pending}
                value={selectedCanonical ? [selectedCanonical] : []}
                variant="outline"
                onValueChange={(values) => {
                  const canonicalLeadId = values[0];
                  if (canonicalLeadId) {
                    setCanonicalLeadIds((current) => ({ ...current, [item.id]: canonicalLeadId }));
                  }
                }}
              >
                {[item.leadA, item.leadB].map((lead) => (
                  <ToggleGroupItem
                    aria-label={`Conservar ${lead.name} como principal`}
                    className="min-h-11 whitespace-normal"
                    key={lead.id}
                    value={lead.id}
                  >
                    Conservar {lead.name} como principal
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Button variant="outline" disabled={pending} onClick={() => dismiss.mutate({ caseId: item.id })}>
                No son la misma persona
              </Button>
            </article>
          );
        }) : (
          <p className="text-sm text-muted-foreground">No hay coincidencias pendientes.</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedCaseIds.length} {selectedCaseIds.length === 1 ? "seleccionado" : "seleccionados"}
          </span>
          <Button
            disabled={!canMergeSelected || pending}
            onClick={() => mergeBatch.mutate({ entries: selectedEntries })}
          >
            Fusionar seleccionados
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={cursorHistory.length === 1 || pending} onClick={goToPreviousPage}>
            Anterior
          </Button>
          <Button variant="outline" disabled={!cases.data?.nextCursor || pending} onClick={goToNextPage}>
            Siguiente
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
