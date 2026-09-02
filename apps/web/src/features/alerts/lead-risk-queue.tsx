"use client";

import { Badge } from "@crm-fran/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";

import AssignLeadDrawer from "@/features/leads/assign-lead-drawer";

import type { useLeadRiskQueue } from "./use-alerts";

const PRIORITY_LABELS = {
  critical: "Más de 24 h",
  high: "3–24 h",
  medium: "1–3 h",
  low: "15–60 min",
} as const;

function formatElapsed(minutes: number | null) {
  if (minutes === null) return "Sin intentos";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} h` : `${hours} h ${remainingMinutes} min`;
}

type LeadRiskQueueData = NonNullable<
  ReturnType<typeof useLeadRiskQueue>["data"]
>;

export function LeadRiskQueue({
  data,
  isLoading,
  isError,
}: {
  data: LeadRiskQueueData;
  isLoading: boolean;
  isError: boolean;
}) {

  if (isLoading) return <Skeleton className="mx-auto h-48 w-full max-w-5xl" />;

  return (
    <Card className="mx-auto w-full max-w-5xl">
      <CardHeader>
        <CardTitle>Leads pendientes de actuación</CardTitle>
        <CardDescription>
          Asignaciones con al menos 15 minutos y sin ningún contacto válido registrado.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isError ? (
          <p className="text-sm text-muted-foreground">No se pudo cargar la cola de actuación.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prioridad</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Desde asignación</TableHead>
                <TableHead>Intentos</TableHead>
                <TableHead>Último intento</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.lead.id}>
                  <TableCell>
                    <Badge variant={item.priority === "critical" ? "destructive" : "secondary"}>
                      {PRIORITY_LABELS[item.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.lead.name}</TableCell>
                  <TableCell>{item.lead.caller?.name ?? "Sin caller"}</TableCell>
                  <TableCell>{formatElapsed(item.minutesSinceAssignment)}</TableCell>
                  <TableCell>{item.attemptCount}</TableCell>
                  <TableCell>{formatElapsed(item.minutesSinceLastAttempt)}</TableCell>
                  <TableCell>
                    <AssignLeadDrawer lead={item.lead} triggerLabel="Abrir lead" />
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay leads pendientes fuera del plazo de 15 minutos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
