"use client";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";

import AssignLeadDrawer, { type Lead } from "@/features/leads/assign-lead-drawer";
import type { NextBestActionWorkMode } from "./next-best-action-mode";

export type NextBestAction = {
  position: number;
  lead: Lead;
  actionType: string;
  score: number;
  urgency: "critical" | "high" | "medium" | "low";
  reasons: string[];
  scheduledAt: Date | string | null;
  attemptCount: number | null;
  minutesSinceAssignment: number | null;
  minutesSinceLastAttempt: number | null;
  recommendationKey?: string;
  sourceAlertId?: string | null;
  workMode?: NextBestActionWorkMode;
};

const ACTION_LABELS: Record<string, string> = {
  no_contact: "Contactar ahora",
  follow_up: "Realizar seguimiento",
  future_call: "Realizar llamada programada",
  appointment: "Revisar agenda",
  rescheduled: "Gestionar reagenda",
  sale: "Registrar venta",
};
const URGENCY_LABELS: Record<NextBestAction["urgency"], string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

function formatMinutes(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

function ActionBadge({ urgency }: { urgency: NextBestAction["urgency"] }) {
  return <Badge variant={urgency === "critical" ? "destructive" : "secondary"}>{URGENCY_LABELS[urgency]}</Badge>;
}

export function NextBestActionView({
  actions,
  mode = "caller",
  onOpen,
  onCompleted,
  onSkip,
}: {
  actions: readonly NextBestAction[];
  mode?: NextBestActionWorkMode;
  onOpen?: (action: NextBestAction) => void | Promise<void>;
  onCompleted?: (action: NextBestAction) => void | Promise<void>;
  onSkip?: (action: NextBestAction) => void;
}) {
  const first = actions[0];
  if (!first) {
    return <Card><CardContent className="py-8"><Empty heading="No hay acciones pendientes" description={`No hay trabajo pendiente para el modo ${mode === "caller" ? "Caller" : "Closer"}.`} /></CardContent></Card>;
  }
  const remainingActions = actions.slice(1);
  const drawerMode = mode === "closer" ? "agenda-feedback" : "default";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <CardDescription>Próxima acción recomendada</CardDescription>
              <CardTitle className="text-2xl">{first.lead.name}</CardTitle>
              <CardDescription>{ACTION_LABELS[first.actionType] ?? "Gestionar lead"}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge urgency={first.urgency} />
              <Badge variant="outline">Puntuación {first.score}</Badge>
              <Badge variant="outline">{mode === "caller" ? "Caller" : "Closer"}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Por qué aparece primero</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {first.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
          <div className="flex flex-wrap content-start gap-2 text-sm text-muted-foreground md:max-w-80">
            <Badge variant="outline">Caller: {first.lead.caller?.name ?? "Sin caller"}</Badge>
            {first.lead.closer && <Badge variant="outline">Closer: {first.lead.closer.name}</Badge>}
            {first.attemptCount !== null && <Badge variant="outline">Intentos: {first.attemptCount}</Badge>}
            {first.minutesSinceAssignment !== null && <Badge variant="outline">Asignado hace {formatMinutes(first.minutesSinceAssignment)}</Badge>}
            {first.scheduledAt && <Badge variant="outline">{new Date(first.scheduledAt).toLocaleString()}</Badge>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <AssignLeadDrawer lead={first.lead} mode={drawerMode} triggerLabel="Gestionar ahora" onOpen={() => onOpen?.(first)} onCompleted={() => onCompleted?.(first)} />
          {onSkip && <Button variant="ghost" type="button" onClick={() => onSkip(first)}>Omitir</Button>}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Siguientes acciones</CardTitle>
          <CardDescription>Ordenadas para tu cartera y tu modo {mode === "caller" ? "Caller" : "Closer"} mediante reglas transparentes de horario, urgencia y contexto operativo.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-96 overflow-auto px-0">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow><TableHead>Orden</TableHead><TableHead>Prioridad</TableHead><TableHead>Lead</TableHead><TableHead>Acción</TableHead><TableHead>Por qué es la mejor ahora</TableHead><TableHead>Acciones</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {remainingActions.map((action) => (
                <TableRow key={action.recommendationKey ?? action.lead.id}>
                  <TableCell>#{action.position}</TableCell>
                  <TableCell><ActionBadge urgency={action.urgency} /></TableCell>
                  <TableCell className="font-medium">{action.lead.name}</TableCell>
                  <TableCell>{ACTION_LABELS[action.actionType] ?? "Gestionar lead"}</TableCell>
                  <TableCell className="max-w-80 whitespace-normal text-muted-foreground">{action.reasons[0]}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1"><AssignLeadDrawer lead={action.lead} mode={drawerMode} triggerLabel="Abrir" onOpen={() => onOpen?.(action)} onCompleted={() => onCompleted?.(action)} />{onSkip && <Button variant="ghost" size="sm" type="button" onClick={() => onSkip(action)}>Omitir</Button>}</div></TableCell>
                </TableRow>
              ))}
              {remainingActions.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No hay más acciones pendientes.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
