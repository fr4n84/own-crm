"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { trpc } from "@/utils/trpc";
import { usePermissions } from "@crm-fran/ui/permissions";

const RATING_LABELS = { strength: "Fortaleza", improve: "A mejorar", unknown: "Desconocido" } as const;
const SIGNAL_LABELS: Record<string, string> = { clear_open_question: "Pregunta abierta clara", confirmed_need: "Necesidad confirmada", confirmed_objection: "Objeción confirmada", clear_next_step: "Siguiente paso claro", missing_discovery: "Falta descubrimiento", unsupported_claim: "Afirmación no respaldada", evidence_insufficient: "Evidencia insuficiente" };

type Analysis = {
  id: string; status: string; role: string; summary: string; requiresPersonalReview: boolean; reviewReasons: string[]; createdAt: Date | string;
  lead: { id: string; name: string }; criteria: { key: string; rating: "strength" | "improve" | "unknown"; evidenceSignals: string[]; recommendation: string }[];
  excludedFromCompensation: boolean; excludedFromAutomaticAssignment: boolean; disciplinaryUseProhibited: boolean;
};

export function CoachingReviewList({ analyses, onReview }: { analyses: readonly Analysis[]; onReview: (id: string, decision: "confirmed" | "discarded") => void }) {
  if (analyses.length === 0) return <Empty heading="Sin análisis de coaching" description="Los borradores aparecerán después de usar voluntariamente Grabar con IA." />;
  return <div className="grid gap-3">{analyses.map((analysis) => <Card size="sm" key={analysis.id}>
    <CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{analysis.lead.name}</CardTitle><Badge variant="outline">{analysis.role === "caller" ? "Caller" : "Closer"}</Badge><Badge variant={analysis.status === "draft" ? "secondary" : "outline"}>{analysis.status === "draft" ? "Borrador pendiente" : analysis.status === "confirmed" ? "Confirmado" : "Descartado"}</Badge>{analysis.requiresPersonalReview && <Badge variant="destructive">Requiere revisión personal</Badge>}</div><CardDescription>{analysis.summary}</CardDescription></CardHeader>
    <CardContent className="grid gap-3">
      {analysis.criteria.map((criterion) => <div key={criterion.key} className="rounded-md border p-3"><div className="flex flex-wrap gap-2"><strong>{criterion.key}</strong><Badge variant="outline">{RATING_LABELS[criterion.rating]}</Badge></div><p className="text-sm text-muted-foreground">{criterion.evidenceSignals.map((signal) => SIGNAL_LABELS[signal] ?? "Señal estructurada").join(" · ")}</p><p className="text-sm">{criterion.recommendation}</p></div>)}
      <p className="text-xs text-muted-foreground">Uso privado y formativo: no se usa para sanciones, salarios, compensación ni asignaciones automáticas.</p>
      {analysis.status === "draft" && <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => onReview(analysis.id, "confirmed")}>Confirmar análisis</Button><Button type="button" variant="outline" onClick={() => onReview(analysis.id, "discarded")}>Descartar</Button></div>}
    </CardContent>
  </Card>)}</div>;
}

export function CommercialCoachingPanel({ targetUserId }: { targetUserId?: string }) {
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const canSeeCohorts = permissions.includes("*") || permissions.includes("coaching:*") || permissions.includes("coaching:read");
  const query = useQuery(trpc.commercialCoaching.list.queryOptions(targetUserId ? { targetUserId } : {}));
  const cohorts = useQuery({ ...trpc.commercialCoaching.cohorts.queryOptions(), enabled: canSeeCohorts });
  const review = useMutation(trpc.commercialCoaching.review.mutationOptions({ onSuccess: async () => queryClient.invalidateQueries({ queryKey: trpc.commercialCoaching.list.queryKey() }) }));
  return <div className="grid gap-4"><Card><CardHeader><CardTitle>Coaching comercial privado</CardTitle><CardDescription>Revisa y confirma recomendaciones estructuradas. No se guardan audio ni transcripción completa.</CardDescription></CardHeader><CardContent>{query.isLoading ? <p className="text-sm text-muted-foreground">Cargando coaching…</p> : query.isError ? <Empty heading="No se pudo cargar el coaching" /> : <CoachingReviewList analyses={(query.data ?? []) as Analysis[]} onReview={(id, decision) => review.mutate({ id, decision })} />}</CardContent></Card>{canSeeCohorts && cohorts.data && <Card size="sm"><CardHeader><CardTitle>Referencia agregada</CardTitle><CardDescription>Comparación anónima ajustada por campaña o producto; exige al menos cinco análisis de tres agentes y nunca clasifica agentes.</CardDescription></CardHeader><CardContent className="grid gap-2">{cohorts.data.length === 0 ? <p className="text-sm text-muted-foreground">Aún no existe una cohorte comparable.</p> : cohorts.data.map((cohort) => <div className="rounded-md border p-3" key={`${cohort.role}:${cohort.difficulty}`}><strong>{cohort.role === "caller" ? "Caller" : "Closer"} · {cohort.difficulty}</strong><p className="text-xs text-muted-foreground">{cohort.sample} análisis · {cohort.agentSample} agentes anónimos</p>{cohort.criteria.map((criterion) => <p className="text-sm" key={criterion.key}>{criterion.key}: {criterion.strengthRate}% fortalezas ({criterion.comparableSample} comparables)</p>)}</div>)}</CardContent></Card>}</div>;
}
