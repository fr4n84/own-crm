"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  InfoIcon,
  PlayIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@crm-fran/ui/components/popover";
import { Separator } from "@crm-fran/ui/components/separator";
import { Skeleton } from "@crm-fran/ui/components/skeleton";

import { trpc } from "@/utils/trpc";

type DecisionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "in_progress"
  | "completed";
type DecisionAction = "approve" | "reject" | "start" | "complete";
type Decision = {
  id: string;
  title: string;
  summary: string;
  sourceType: string;
  scope: string;
  status: DecisionStatus;
  priority: "low" | "medium" | "high" | "critical";
  rank: number;
  evidence: Record<string, unknown>;
  estimatedImpactCents: number | null;
  impactIsEstimated: boolean;
  confidencePercent: number | null;
  sampleSize: number | null;
  assignee: { id: string; name: string } | null;
  dueAt: string | null;
  events: readonly {
    id: string;
    fromStatus: DecisionStatus | null;
    toStatus: DecisionStatus;
    actor: { id: string; name: string };
    note: string | null;
    occurredAt: string;
  }[];
};

const money = (value: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value / 100);

const statusLabels: Record<DecisionStatus, string> = {
  proposed: "Propuesta",
  approved: "Aprobada",
  rejected: "Rechazada",
  in_progress: "En curso",
  completed: "Completada",
};
const priorityLabels = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
} as const;
const sourceLabels: Record<string, string> = {
  profitability: "Rentabilidad",
  commercial_intelligence: "Inteligencia comercial",
  quality_control: "Control de calidad",
  commercial_experiment: "Experimento comercial",
};

function Information({ title, children }: { title: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-11"
            aria-label={`Información sobre ${title}`}
          />
        }
      >
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const rows = Object.entries(evidence).filter(([, value]) => value !== null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-medium">Evidencia congelada</h3>
        <Information title="Evidencia congelada">
          Esta copia conserva los datos usados al crear la propuesta. No cambia aunque la señal de origen se actualice después.
        </Information>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          La propuesta no incluye indicadores adicionales.
        </p>
      ) : (
        <dl className="grid gap-2 sm:grid-cols-2">
          {rows.map(([key, value]) => (
            <div key={key} className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">{key}</dt>
              <dd className="break-words text-sm font-medium">
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function DecisionActions({
  decision,
  pending,
  run,
}: {
  decision: Decision;
  pending: boolean;
  run: (action: DecisionAction) => void;
}) {
  if (decision.status === "proposed") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => run("approve")}
          disabled={pending}
          aria-label="Aprobar decisión"
        >
          <CheckIcon data-icon="inline-start" />
          Aprobar
        </Button>
        <Button
          variant="outline"
          onClick={() => run("reject")}
          disabled={pending}
          aria-label="Rechazar decisión"
        >
          <XIcon data-icon="inline-start" />
          Rechazar
        </Button>
      </div>
    );
  }
  if (decision.status === "approved") {
    return (
      <Button
        onClick={() => run("start")}
        disabled={pending}
        aria-label="Iniciar decisión"
      >
        <PlayIcon data-icon="inline-start" />
        Iniciar
      </Button>
    );
  }
  if (decision.status === "in_progress") {
    return (
      <Button
        onClick={() => run("complete")}
        disabled={pending}
        aria-label="Completar decisión"
      >
        <CheckIcon data-icon="inline-start" />
        Completar
      </Button>
    );
  }
  return null;
}

function DecisionCard({
  decision,
  pending,
  transition,
}: {
  decision: Decision;
  pending: boolean;
  transition: (decisionId: string, action: DecisionAction) => void;
}) {
  return (
    <Card size="sm" className="rounded-lg shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">#{decision.rank}</Badge>
          <Badge
            variant={
              decision.priority === "critical" ? "destructive" : "outline"
            }
          >
            Prioridad {priorityLabels[decision.priority]}
          </Badge>
          <Badge variant="secondary">{statusLabels[decision.status]}</Badge>
          <Badge variant="outline">
            {sourceLabels[decision.sourceType] ?? decision.sourceType}
          </Badge>
        </div>
        <CardTitle>{decision.title}</CardTitle>
        <CardDescription>{decision.summary}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {decision.estimatedImpactCents !== null
              ? `Impacto estimado · ${money(decision.estimatedImpactCents)}`
              : "Impacto sin estimar"}
          </Badge>
          <Badge variant="outline">
            {decision.confidencePercent !== null
              ? `Confianza ${decision.confidencePercent}%`
              : "Confianza no calculada"}
          </Badge>
          {decision.sampleSize !== null ? (
            <Badge variant="outline">{decision.sampleSize} casos</Badge>
          ) : null}
          <Information title="Impacto y confianza">
            El impacto es una estimación transparente, no dinero garantizado. La confianza solo aparece cuando la señal de origen proporciona una medida válida.
          </Information>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Alcance</dt>
            <dd className="break-words">{decision.scope}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Responsable</dt>
            <dd>{decision.assignee?.name ?? "Sin asignar"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fecha límite</dt>
            <dd>
              {decision.dueAt
                ? new Date(decision.dueAt).toLocaleDateString("es-ES")
                : "Sin definir"}
            </dd>
          </div>
        </dl>
        <Evidence evidence={decision.evidence} />
        {decision.events.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Separator />
            <h3 className="text-sm font-medium">Historial inmutable</h3>
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
              {decision.events.map((event) => (
                <p key={event.id} className="text-xs text-muted-foreground">
                  {new Date(event.occurredAt).toLocaleString("es-ES")} ·{" "}
                  {event.actor.name} · {statusLabels[event.toStatus]}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <DecisionActions
          decision={decision}
          pending={pending}
          run={(action) => transition(decision.id, action)}
        />
      </CardFooter>
    </Card>
  );
}

export default function DecisionCenterPage() {
  const queryClient = useQueryClient();
  const weekly = useQuery(trpc.decisionCenter.weekly.queryOptions());
  const transition = useMutation(
    trpc.decisionCenter.transition.mutationOptions({
      onSuccess: () => {
        toast.success("Decisión actualizada");
        void queryClient.invalidateQueries({
          queryKey: trpc.decisionCenter.weekly.queryKey(),
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (weekly.isPending) {
    return (
      <section className="grid gap-3 md:grid-cols-2" aria-live="polite">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }
  if (weekly.isError || !weekly.data) {
    return (
      <section>
        <Empty
          heading="No se pudo cargar el centro de decisiones"
          description="Esta sección contiene datos económicos y de equipo y requiere administración global."
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <Card size="sm" className="rounded-lg shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheckIcon aria-hidden="true" />
            <CardTitle>Centro de decisiones semanal</CardTitle>
            <Information title="Centro de decisiones semanal">
              Reúne un máximo de cinco propuestas procedentes de señales ya existentes. Una persona debe aprobar y ejecutar cada decisión; esta pantalla nunca modifica campañas, asignaciones, reglas ni señales de origen.
            </Information>
            <Badge variant="outline">Solo sugerencias</Badge>
          </div>
          <CardDescription>
            Semana del{" "}
            {new Date(weekly.data.weekStart).toLocaleDateString("es-ES")}. Un
            máximo de {weekly.data.maximumDecisions} decisiones congeladas y
            explicables.
          </CardDescription>
        </CardHeader>
      </Card>

      {weekly.data.decisions.length === 0 ? (
        <Empty
          className="rounded-lg bg-card px-4 ring-1 ring-foreground/10"
          heading="Sin decisiones para esta semana"
          description="No se detectaron decisiones al congelar esta semana. El snapshot permanecerá sin cambios hasta la siguiente semana."
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {weekly.data.decisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              pending={transition.isPending}
              transition={(decisionId, action) =>
                transition.mutate({ decisionId, action })
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
