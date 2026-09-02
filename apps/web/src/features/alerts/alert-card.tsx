"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { cn } from "@crm-fran/ui/lib/utils";

import AssignLeadDrawer from "@/features/leads/assign-lead-drawer";

import {
  formatAlertCountdown,
  getAlertRemaining,
} from "./alert-countdown";
import { normalizeAlertSeverity } from "./alert-importance";
import {
  getEffectiveAlertSeverity,
  type AlertRelevancePreferences,
} from "./alert-relevance";
import {
  ALERT_TYPE_LABELS,
  getAlertType,
  getAppointmentHistory,
} from "./alert-type";
import { AlertResolutionDialog } from "./alert-resolution-dialog";
import type { Alert } from "./use-alerts";

interface AlertCardProps {
  alert: Alert;
  onDismiss: (id: string) => void;
  relevancePreferences: AlertRelevancePreferences;
}

const SEVERITY_PRESENTATION = {
  urgent: { label: "Alta", className: "bg-destructive/10 text-destructive" },
  warning: { label: "Media", className: "bg-warning/15 text-warning-foreground" },
  info: { label: "Baja", className: "bg-success/15 text-success-foreground" },
} as const;

const KIND_LABEL = {
  no_contact: "No contact",
  follow_up: "Seguimiento",
} as const;

export function AlertCard({
  alert,
  onDismiss,
  relevancePreferences,
}: AlertCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const severity =
    getEffectiveAlertSeverity(alert, relevancePreferences, now) ??
    normalizeAlertSeverity(alert.severity);
  const presentation = severity
    ? SEVERITY_PRESENTATION[severity]
    : { label: alert.severity, className: "" };
  const kind = alert.kind as keyof typeof KIND_LABEL;
  const alertType = getAlertType(alert);
  const appointmentHistory = getAppointmentHistory(alert);
  const remainingMs = getAlertRemaining(alert, now);
  const countdown = formatAlertCountdown(remainingMs);
  const isExpired = remainingMs < 0;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex flex-col gap-1">
            <CardTitle>{alert.lead?.name ?? "Lead"}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Caller: {alert.lead?.caller?.name ?? "Sin caller"}</span>
              {alert.lead?.phone ? (
                <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${alert.lead.phone}`}>
                  Teléfono: {alert.lead.phone}
                </a>
              ) : (
                <span>Teléfono: Sin teléfono</span>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {alert.lead ? (
                <AssignLeadDrawer
                  lead={alert.lead}
                  mode="post-assignment-feedback"
                  triggerLabel="Registrar gestión"
                />
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDismiss(alert.id)}
              >
                Descartar
              </Button>
              <AlertResolutionDialog alert={alert} />
              <Badge
                variant={severity ? "outline" : "default"}
                className={presentation.className}
              >
                {presentation.label}
              </Badge>
            </div>
            <p
              className={cn(
                "text-xs tabular-nums text-muted-foreground",
                isExpired && "text-destructive",
              )}
              aria-label={`Tiempo restante: ${countdown}`}
            >
              Tiempo: {countdown}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium">
          {alertType ? ALERT_TYPE_LABELS[alertType] : KIND_LABEL[kind] ?? alert.kind}
        </p>
        <p className="text-xs text-muted-foreground">{alert.message}</p>
        {appointmentHistory.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Historial de agenda</p>
            <ol className="flex flex-col gap-1">
              {appointmentHistory.map((entry, index) => (
                <li key={`${entry.date}-${entry.time}-${index}`}>
                  {index === 0 ? "Agenda inicial" : `Reagenda ${index}`}: {entry.date}{" "}
                  {entry.time}
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Próxima: {new Date(alert.nextShowAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
