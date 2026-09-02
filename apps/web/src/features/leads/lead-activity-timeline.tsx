"use client";

import {
  BellIcon,
  BanIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleUserRoundIcon,
  CircleOffIcon,
  EyeIcon,
  FileTextIcon,
  HistoryIcon,
  RotateCcwIcon,
  UserRoundCheckIcon,
} from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Separator } from "@crm-fran/ui/components/separator";
import { Skeleton } from "@crm-fran/ui/components/skeleton";

import { useLeadActivity } from "./use-lead-activity";

type ActivityKind = NonNullable<
  ReturnType<typeof useLeadActivity>["data"]
>[number]["kind"];

const ICON_BY_KIND: Record<ActivityKind, typeof HistoryIcon> = {
  lead_created: FileTextIcon,
  lead_type_changed: FileTextIcon,
  lead_attribution_updated: FileTextIcon,
  caller_assigned: CircleUserRoundIcon,
  closer_assigned: UserRoundCheckIcon,
  state_changed: CheckCircle2Icon,
  caller_feedback: FileTextIcon,
  closer_feedback: FileTextIcon,
  appointment_scheduled: CalendarClockIcon,
  appointment_rescheduled: CalendarClockIcon,
  alert_created: BellIcon,
  alert_resolved: CheckCircle2Icon,
  alert_dismissed: BellIcon,
  lead_recovered: RotateCcwIcon,
  lead_discarded: BanIcon,
  recommendation_shown: EyeIcon,
  recommendation_opened: EyeIcon,
  recommendation_completed: CheckCircle2Icon,
  recommendation_skipped: CircleOffIcon,
};

function formatActivityDate(value: Date | string | null) {
  if (!value) return "Fecha original no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const ATTRIBUTION_LABELS = {
  source: "Fuente",
  campaign: "Campaña",
  ad: "Anuncio",
  creative: "Creatividad",
  acquisitionAngle: "Ángulo de captación",
} as const;

export function attributionChangeSummary(metadata: Record<string, unknown>) {
  const before = typeof metadata.before === "object" && metadata.before !== null
    ? metadata.before as Record<string, unknown>
    : {};
  const after = typeof metadata.after === "object" && metadata.after !== null
    ? metadata.after as Record<string, unknown>
    : {};
  return Object.entries(ATTRIBUTION_LABELS).flatMap(([key, label]) => {
    const previous = typeof before[key] === "string" ? before[key] as string : null;
    const current = typeof after[key] === "string" ? after[key] as string : null;
    return previous === current ? [] : [{ key, label, previous, current }];
  });
}

export function LeadActivityTimeline({
  leadId,
  enabled,
}: {
  leadId: string;
  enabled: boolean;
}) {
  const activity = useLeadActivity(leadId, enabled);

  if (activity.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-label="Cargando actividad">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (activity.isError) {
    return (
      <p className="text-sm text-destructive">
        No se pudo cargar el historial del lead.
      </p>
    );
  }

  if (!activity.data || activity.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay actividad registrada para este lead.
      </p>
    );
  }

  const events = activity.data;

  return (
    <ol className="flex flex-col" aria-label="Historial del lead">
      {events.map((event, index) => {
        const Icon = ICON_BY_KIND[event.kind];
        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-primary shadow-sm">
                <Icon aria-hidden="true" />
              </span>
              {index < events.length - 1 && (
                <Separator orientation="vertical" className="my-2 min-h-8 flex-1" />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold leading-tight">{event.title}</p>
                {event.reconstructed && (
                  <Badge variant="outline">Histórico reconstruido</Badge>
                )}
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground">
                  {event.description}
                </p>
              )}
              {event.kind === "lead_attribution_updated" ? (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {attributionChangeSummary(event.metadata).map((change) => (
                    <li key={change.key}>
                      {change.label}: {change.previous ?? "Sin dato"} → {change.current ?? "Sin dato"}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {formatActivityDate(event.occurredAt)}
                {event.actorName ? ` · ${event.actorName}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
