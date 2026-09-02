"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm-fran/ui/components/dialog";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@crm-fran/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { authClient } from "@/lib/auth-client";
import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { trpc } from "@/utils/trpc";

type GoalMetric =
  | "contacted"
  | "shows"
  | "appointments"
  | "appointment_rate"
  | "assigned"
  | "future_calls";

type GoalFormValue = {
  metric: GoalMetric;
  targetValue: string;
  startDate: string;
  endDate: string;
};

const METRIC_LABELS: Record<GoalMetric, string> = {
  contacted: "Contactados",
  shows: "Shows",
  appointments: "Agendas",
  appointment_rate: "Porcentaje de agenda",
  assigned: "Asignados",
  future_calls: "Llamar futuro",
};

const EMPTY_FORM: GoalFormValue = {
  metric: "contacted",
  targetValue: "",
  startDate: "",
  endDate: "",
};

export function PersonalGoalsPanel({ selectedUserId }: { selectedUserId?: string }) {
  const { data: session } = authClient.useSession();
  const { permissions } = usePermissionState();
  const sessionUserId = session?.user.id;
  const sessionRoleId = (session?.user as { roleId?: string } | undefined)?.roleId;
  const availableMetrics = Object.entries(METRIC_LABELS).filter(
    ([metric]) => sessionRoleId !== "role-closer" || metric === "shows",
  );
  const defaultMetric: GoalMetric =
    sessionRoleId === "role-closer" ? "shows" : "contacted";
  const inspectedUserId =
    selectedUserId && permissions.includes("*") ? selectedUserId : sessionUserId;
  const canManage = Boolean(sessionUserId && inspectedUserId === sessionUserId);
  const goals = useQuery({
    ...trpc.personalGoals.list.queryOptions(
      inspectedUserId && inspectedUserId !== sessionUserId
        ? { userId: inspectedUserId }
        : undefined,
    ),
    enabled: Boolean(inspectedUserId),
  });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<GoalFormValue>(EMPTY_FORM);
  const numericTarget = Number(form.targetValue);
  const formIsValid =
    Number.isInteger(numericTarget) &&
    numericTarget > 0 &&
    (form.metric !== "appointment_rate" || numericTarget <= 100) &&
    Boolean(form.startDate) &&
    Boolean(form.endDate) &&
    form.startDate <= form.endDate;
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.personalGoals.list.queryKey() });
  const createGoal = useTrpcMutationWithToast(
    trpc.personalGoals.create.mutationOptions({ onSuccess: invalidate }),
    { success: "Objetivo creado", error: "No se pudo crear el objetivo" },
  );
  const updateGoal = useTrpcMutationWithToast(
    trpc.personalGoals.update.mutationOptions({ onSuccess: invalidate }),
    { success: "Objetivo actualizado", error: "No se pudo actualizar el objetivo" },
  );
  const deleteGoal = useTrpcMutationWithToast(
    trpc.personalGoals.delete.mutationOptions({ onSuccess: invalidate }),
    { success: "Objetivo eliminado", error: "No se pudo eliminar el objetivo" },
  );

  const closeForm = () => {
    setOpen(false);
    setEditingId(undefined);
    setForm(EMPTY_FORM);
  };

  const submit = () => {
    if (!formIsValid) return;
    const goal = { ...form, targetValue: numericTarget };
    if (editingId) {
      updateGoal.mutate({ id: editingId, goal }, { onSuccess: closeForm });
    } else {
      createGoal.mutate(goal, { onSuccess: closeForm });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivos personales</CardTitle>
        <CardDescription>
          Progreso basado en las acciones realizadas por cada usuario durante
          el periodo de su objetivo, según la actividad histórica registrada.
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button
              onClick={() => {
                setForm({ ...EMPTY_FORM, metric: defaultMetric });
                setOpen(true);
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Nuevo objetivo
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {goals.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : goals.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {goals.data.map((goal) => (
              <Card key={goal.id} size="sm">
                <CardHeader>
                  <CardTitle>{METRIC_LABELS[goal.metric]}</CardTitle>
                  <CardDescription>
                    {goal.startDate} — {goal.endDate}
                  </CardDescription>
                  <CardAction>
                    <Badge variant={goal.status === "active" ? "default" : "secondary"}>
                      {goal.status === "active"
                        ? "Activo"
                        : goal.status === "upcoming"
                          ? "Próximo"
                          : "Finalizado"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <Progress value={goal.progressPercentage}>
                    <ProgressLabel>
                      {goal.progress} de {goal.targetValue}
                      {goal.metric === "appointment_rate" ? "%" : ""}
                    </ProgressLabel>
                    <ProgressValue>
                      {() => `${goal.progressPercentage}%`}
                    </ProgressValue>
                  </Progress>
                </CardContent>
                {canManage && (
                  <CardFooter className="gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(goal.id);
                        setForm({
                          metric: goal.metric,
                          targetValue: String(goal.targetValue),
                          startDate: goal.startDate,
                          endDate: goal.endDate,
                        });
                        setOpen(true);
                      }}
                    >
                      <PencilIcon data-icon="inline-start" />
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteGoal.isPending}
                      onClick={() => {
                        if (window.confirm("¿Eliminar este objetivo?")) {
                          deleteGoal.mutate({ id: goal.id });
                        }
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Eliminar
                    </Button>
                  </CardFooter>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Empty heading="No hay objetivos para este usuario" />
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closeForm())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar objetivo" : "Nuevo objetivo"}</DialogTitle>
            <DialogDescription>
              Define la métrica, el valor a alcanzar y su intervalo.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="goal-metric">Métrica</FieldLabel>
              <Select
                value={form.metric}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, metric: value as GoalMetric }))
                }
              >
                <SelectTrigger id="goal-metric">
                  <SelectValue>{METRIC_LABELS[form.metric]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableMetrics.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="goal-target">Objetivo</FieldLabel>
              <Input
                id="goal-target"
                type="number"
                min={1}
                max={form.metric === "appointment_rate" ? 100 : undefined}
                required
                value={form.targetValue}
                onChange={(event) =>
                  setForm((current) => ({ ...current, targetValue: event.target.value }))
                }
              />
            </Field>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="goal-start">Desde</FieldLabel>
                <Input
                  id="goal-start"
                  type="date"
                  required
                  value={form.startDate}
                  max={form.endDate || undefined}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="goal-end">Hasta</FieldLabel>
                <Input
                  id="goal-end"
                  type="date"
                  required
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </Field>
            </FieldGroup>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancelar</Button>
            <Button
              disabled={!formIsValid || createGoal.isPending || updateGoal.isPending}
              onClick={submit}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
