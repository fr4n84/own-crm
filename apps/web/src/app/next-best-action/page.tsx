"use client";

import { useEffect, useRef, useState } from "react";
import { InfoIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@crm-fran/ui/components/dialog";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldLabel } from "@crm-fran/ui/components/field";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Textarea } from "@crm-fran/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@crm-fran/ui/components/toggle-group";
import { Can } from "@crm-fran/ui/permissions/can";

import { NextBestActionView, type NextBestAction } from "@/features/alerts/next-best-action-view";
import { normalizeWorkMode, type NextBestActionWorkMode } from "@/features/alerts/next-best-action-mode";
import { useNextBestActionModes, useNextBestActions, useNextBestActionMetrics, useRecordNextBestActionEvent } from "@/features/alerts/use-alerts";

const WORK_MODE_STORAGE_KEY = "next-best-action-work-mode";
const MODE_LABELS: Record<NextBestActionWorkMode, string> = { caller: "Caller", closer: "Closer" };

export default function NextBestActionPage() {
  return (
    <Can permission="alerts:read" fallback={<main className="dashboard-arc-theme p-4 sm:p-6"><Empty heading="No tienes permisos" description="Necesitas acceso a alertas para consultar esta cola." /></main>}>
      <NextBestActionContent />
    </Can>
  );
}

function NextBestActionContent() {
  const { data: availableModes = [], isLoading: isModesLoading, isError: isModesError } = useNextBestActionModes();
  const [workMode, setWorkMode] = useState<NextBestActionWorkMode>("caller");
  const modeReady = availableModes.includes(workMode);
  const { data = [], isLoading, isError } = useNextBestActions(workMode, modeReady);
  const { data: metrics } = useNextBestActionMetrics(workMode, modeReady);
  const event = useRecordNextBestActionEvent();
  const [skippedAction, setSkippedAction] = useState<NextBestAction | null>(null);
  const [skipReason, setSkipReason] = useState("");
  type TrackableRecommendation = { lead: { id: string }; recommendationKey?: string; actionType?: string };
  const shownKeys = useRef(new Set<string>());
  const pendingShownKeys = useRef(new Set<string>());
  const shownAttempts = useRef(new Map<string, number>());
  const shownTimers = useRef(new Map<string, number>());
  const activeShownKeys = useRef(new Set<string>());

  useEffect(() => {
    if (availableModes.length === 0) return;
    const persistedMode = window.localStorage.getItem(WORK_MODE_STORAGE_KEY);
    const normalizedMode = normalizeWorkMode(persistedMode, availableModes);
    setWorkMode(normalizedMode);
    window.localStorage.setItem(WORK_MODE_STORAGE_KEY, normalizedMode);
  }, [availableModes.join("|")]);

  const changeMode = (mode: NextBestActionWorkMode) => {
    if (!availableModes.includes(mode)) return;
    setWorkMode(mode);
    window.localStorage.setItem(WORK_MODE_STORAGE_KEY, mode);
  };

  const record = async (
    action: TrackableRecommendation,
    kind: "recommendation_shown" | "recommendation_opened" | "recommendation_completed" | "recommendation_skipped",
    reason?: string,
  ) => {
    if (!action.recommendationKey) return;
    await event.mutateAsync({
      leadId: action.lead.id,
      recommendationKey: action.recommendationKey,
      kind,
      ...(action.actionType ? { actionType: action.actionType } : {}),
      ...(reason ? { reason } : {}),
    });
  };

  const markShown = (action: TrackableRecommendation) => {
    const key = action.recommendationKey;
    if (!key || shownKeys.current.has(key) || pendingShownKeys.current.has(key)) return;
    pendingShownKeys.current.add(key);
    void record(action, "recommendation_shown")
      .then(() => {
        if (activeShownKeys.current.has(key)) shownKeys.current.add(key);
        shownAttempts.current.delete(key);
      })
      .catch(() => {
        const attempt = (shownAttempts.current.get(key) ?? 0) + 1;
        shownAttempts.current.set(key, attempt);
        if (attempt <= 3 && activeShownKeys.current.has(key)) {
          const timeoutId = window.setTimeout(() => {
            shownTimers.current.delete(key);
            if (activeShownKeys.current.has(key)) markShown(action);
          }, 500 * 2 ** (attempt - 1));
          shownTimers.current.set(key, timeoutId);
        }
      })
      .finally(() => pendingShownKeys.current.delete(key));
  };

  useEffect(() => {
    const activeKeys = new Set(data.map((action) => action.recommendationKey).filter((key): key is string => Boolean(key)));
    activeShownKeys.current = activeKeys;
    for (const [key, timeoutId] of shownTimers.current) {
      if (!activeKeys.has(key)) {
        window.clearTimeout(timeoutId);
        shownTimers.current.delete(key);
        pendingShownKeys.current.delete(key);
        shownAttempts.current.delete(key);
      }
    }
    data.forEach(markShown);
  }, [data]);

  useEffect(() => () => {
    shownTimers.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    shownTimers.current.clear();
  }, []);

  if (isModesLoading || (!isModesError && (availableModes.length === 0 || !modeReady)) || isLoading) {
    return <main className="dashboard-arc-theme flex flex-col gap-4 bg-background p-4 sm:p-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></main>;
  }
  if (isModesError || isError) {
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><Empty heading="No se pudo calcular la próxima mejor acción" description="Conservamos tu modo de trabajo. Reintenta cuando vuelva la conexión." /></main>;
  }

  return (
    <main className="dashboard-arc-theme flex min-h-full flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Próxima mejor acción</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Una cola priorizada y explicable para actuar sobre el lead correcto sin cambiar asignaciones ni automatizar decisiones.</p>
      </header>

      <Card size="sm" className="w-fit max-w-full">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel>Modo de trabajo</FieldLabel>
              <Popover>
                <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="size-11" aria-label="Información sobre el modo de trabajo" />}><InfoIcon aria-hidden="true" /></PopoverTrigger>
                <PopoverContent align="start" className="w-[min(92vw,28rem)]"><PopoverHeader><PopoverTitle>Modo de trabajo</PopoverTitle><PopoverDescription>Cambia únicamente la cola y las acciones operativas que ves. No cambia tu identidad, ownership ni permisos. Caller muestra contacto, llamadas y seguimientos permitidos; Closer muestra agendas, ventas, reagendas y seguimientos permitidos. El servidor valida siempre el rol autenticado.</PopoverDescription></PopoverHeader></PopoverContent>
              </Popover>
            </div>
            <ToggleGroup aria-label="Modo de trabajo" value={[workMode]} variant="outline" onValueChange={(values) => { const selected = values[0]; if (selected === "caller" || selected === "closer") changeMode(selected); }}>
              {availableModes.map((mode) => <ToggleGroupItem key={mode} value={mode} className="h-11 min-h-11 px-4" disabled={availableModes.length === 1}>{MODE_LABELS[mode]}</ToggleGroupItem>)}
            </ToggleGroup>
          </Field>
          <Badge variant="outline">Vista {MODE_LABELS[workMode]}</Badge>
        </CardContent>
      </Card>

      {metrics && (
        <section aria-label="Contadores de recomendaciones" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[["Mostradas", metrics.shown], ["Completadas", metrics.completed], ["Omitidas", metrics.skipped], ["Cumplimiento", `${metrics.complianceRate}%`], ["Reacción media", metrics.averageReactionMinutes === null ? "—" : `${metrics.averageReactionMinutes} min`]].map(([label, value]) => (
            <Card size="sm" key={String(label)}><CardHeader className="pb-1"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>
          ))}
        </section>
      )}

      <NextBestActionView actions={data} mode={workMode} onOpen={(action) => record(action, "recommendation_opened")} onCompleted={(action) => record(action, "recommendation_completed")} onSkip={setSkippedAction} />

      <Dialog open={Boolean(skippedAction)} onOpenChange={(open) => { if (!open) { setSkippedAction(null); setSkipReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Omitir recomendación</DialogTitle><DialogDescription>Indica por qué esta acción no aplica ahora. El motivo queda en el historial de la recomendación.</DialogDescription></DialogHeader>
          <Textarea aria-label="Motivo para omitir" value={skipReason} onChange={(change) => setSkipReason(change.target.value)} />
          <DialogFooter><Button variant="outline" type="button" onClick={() => { setSkippedAction(null); setSkipReason(""); }}>Cancelar</Button><Button type="button" disabled={!skipReason.trim() || event.isPending} onClick={async () => { if (!skippedAction) return; await record(skippedAction, "recommendation_skipped", skipReason); setSkipReason(""); setSkippedAction(null); }}>Confirmar omisión</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
