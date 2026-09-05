"use client";

import { useState } from "react";

import { Button } from "@crm-fran/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm-fran/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";

import type {
  AlertRelevanceMode,
  AlertRelevancePreferences,
  ConfigurableAlertKind,
} from "./alert-relevance";
import { useUpdateAlertPreferences } from "./use-alerts";
import { getAlertSeverityLabel } from "./alert-labels";

const CONDITION_OPTIONS: Array<{
  kind: ConfigurableAlertKind;
  label: string;
}> = [
  { kind: "no_contact", label: "Sin contacto" },
  { kind: "follow_up", label: "Seguimiento" },
  { kind: "future_call", label: "Llamar futuro" },
  { kind: "appointment", label: "Agenda" },
  { kind: "rescheduled", label: "Reagenda" },
];

export function AlertPreferencesDialog({
  preferences,
}: {
  preferences: AlertRelevancePreferences;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AlertRelevanceMode>(preferences.mode);
  const [urgentHours, setUrgentHours] = useState(
    String(preferences.urgentThresholdHours),
  );
  const [warningHours, setWarningHours] = useState(
    String(preferences.warningThresholdHours),
  );
  const [conditionSeverities, setConditionSeverities] = useState(
    preferences.conditionSeverities,
  );
  const [timeThresholds, setTimeThresholds] = useState(() => Object.fromEntries(CONDITION_OPTIONS.map(({ kind }) => [kind, { urgent: String(preferences.timeThresholds[kind].urgent), warning: String(preferences.timeThresholds[kind].warning) }])) as Record<ConfigurableAlertKind, { urgent: string; warning: string }>);
  const updatePreferences = useUpdateAlertPreferences();
  const urgent = Number(urgentHours);
  const warning = Number(warningHours);
  const thresholdsInvalid =
    !Number.isInteger(urgent) ||
    !Number.isInteger(warning) ||
    urgent < 0 ||
    warning <= urgent;
  const perTypeThresholdsInvalid = CONDITION_OPTIONS.some(({ kind }) => {
    const typeUrgent = Number(timeThresholds[kind].urgent);
    const typeWarning = Number(timeThresholds[kind].warning);
    return !Number.isInteger(typeUrgent) || !Number.isInteger(typeWarning) || typeUrgent < 0 || typeWarning <= typeUrgent;
  });

  const openWithCurrentPreferences = () => {
    setMode(preferences.mode);
    setUrgentHours(String(preferences.urgentThresholdHours));
    setWarningHours(String(preferences.warningThresholdHours));
    setConditionSeverities(preferences.conditionSeverities);
    setTimeThresholds(Object.fromEntries(CONDITION_OPTIONS.map(({ kind }) => [kind, { urgent: String(preferences.timeThresholds[kind].urgent), warning: String(preferences.timeThresholds[kind].warning) }])) as Record<ConfigurableAlertKind, { urgent: string; warning: string }>);
    setOpen(true);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openWithCurrentPreferences}>
        Configurar relevancia
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configuración personal de alertas</DialogTitle>
            <DialogDescription>
              Estas preferencias se guardan únicamente para tu usuario.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="relevanceMode">Cálculo de relevancia</FieldLabel>
              <Select
                value={mode}
                onValueChange={(value) => {
                  if (value === "condition" || value === "time") setMode(value);
                }}
              >
                <SelectTrigger id="relevanceMode">
                  <SelectValue>
                    {mode === "time" ? "Por tiempo restante" : "Por condición"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="condition">Por condición</SelectItem>
                    <SelectItem value="time">Por tiempo restante</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Por condición parte de la relevancia definida por el suceso. En
                ambos modos la prioridad aumenta automáticamente al acercarse el
                vencimiento y nunca disminuye.
              </FieldDescription>
            </Field>

            {(
              <div className="grid gap-4 sm:grid-cols-2">
                <Field invalid={thresholdsInvalid}>
                  <FieldLabel htmlFor="urgentThresholdHours">
                    Alta: horas restantes
                  </FieldLabel>
                  <Input
                    id="urgentThresholdHours"
                    type="number"
                    min="0"
                    step="1"
                    value={urgentHours}
                    onChange={(event) => setUrgentHours(event.target.value)}
                    aria-invalid={thresholdsInvalid}
                  />
                  <FieldDescription>
                    La alerta será Alta cuando queden estas horas o menos.
                  </FieldDescription>
                </Field>

                <Field invalid={thresholdsInvalid}>
                  <FieldLabel htmlFor="warningThresholdHours">
                    Media: horas restantes
                  </FieldLabel>
                  <Input
                    id="warningThresholdHours"
                    type="number"
                    min="1"
                    step="1"
                    value={warningHours}
                    onChange={(event) => setWarningHours(event.target.value)}
                    aria-invalid={thresholdsInvalid}
                  />
                  <FieldDescription>
                    Por encima de este valor, la alerta será Baja.
                  </FieldDescription>
                </Field>

                {thresholdsInvalid && (
                  <FieldError className="sm:col-span-2">
                    Media debe tener más horas que Alta y ambos valores deben ser
                    enteros no negativos.
                  </FieldError>
                )}
              </div>
            )}

            <div className="grid gap-3">
              <p className="text-sm font-medium">Ventanas por tipo de alerta</p>
              {CONDITION_OPTIONS.map(({ kind, label }) => (
                <div key={`time-${kind}`} className="grid grid-cols-[1fr_6rem_6rem] items-end gap-2">
                  <FieldLabel>{label}</FieldLabel>
                  <Field invalid={Number(timeThresholds[kind].warning) <= Number(timeThresholds[kind].urgent)}><FieldLabel htmlFor={`${kind}-urgent-hours`}>Alta</FieldLabel><Input id={`${kind}-urgent-hours`} aria-label={`${label}: horas para Alta`} type="number" min="0" step="1" value={timeThresholds[kind].urgent} onChange={(event) => setTimeThresholds((current) => ({ ...current, [kind]: { ...current[kind], urgent: event.target.value } }))} /></Field>
                  <Field invalid={Number(timeThresholds[kind].warning) <= Number(timeThresholds[kind].urgent)}><FieldLabel htmlFor={`${kind}-warning-hours`}>Media</FieldLabel><Input id={`${kind}-warning-hours`} aria-label={`${label}: horas para Media`} type="number" min="1" step="1" value={timeThresholds[kind].warning} onChange={(event) => setTimeThresholds((current) => ({ ...current, [kind]: { ...current[kind], warning: event.target.value } }))} /></Field>
                </div>
              ))}
              {perTypeThresholdsInvalid ? <FieldError>En cada tipo, Media debe tener más horas que Alta.</FieldError> : null}
            </div>
            {mode === "condition" && (
              <div className="grid gap-3">
                {CONDITION_OPTIONS.map(({ kind, label }) => (
                  <Field
                    key={kind}
                    className="flex-row items-center justify-between gap-4"
                  >
                    <FieldLabel htmlFor={`condition-${kind}`}>
                      {label}
                    </FieldLabel>
                    <Select
                      value={conditionSeverities[kind]}
                      onValueChange={(value) => {
                        if (
                          value === "urgent" ||
                          value === "warning" ||
                          value === "info"
                        ) {
                          setConditionSeverities((current) => ({
                            ...current,
                            [kind]: value,
                          }));
                        }
                      }}
                    >
                      <SelectTrigger id={`condition-${kind}`} className="w-32">
                        <SelectValue>
                          {getAlertSeverityLabel(conditionSeverities[kind])}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="urgent">Alta</SelectItem>
                          <SelectItem value="warning">Media</SelectItem>
                          <SelectItem value="info">Baja</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
              </div>
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button
              disabled={thresholdsInvalid || perTypeThresholdsInvalid || updatePreferences.isPending}
              onClick={() => {
                updatePreferences.mutate(
                  {
                    relevanceMode: mode,
                    urgentThresholdHours: urgent,
                    warningThresholdHours: warning,
                    noContactUrgentThresholdHours: Number(timeThresholds.no_contact.urgent), noContactWarningThresholdHours: Number(timeThresholds.no_contact.warning),
                    followUpUrgentThresholdHours: Number(timeThresholds.follow_up.urgent), followUpWarningThresholdHours: Number(timeThresholds.follow_up.warning),
                    futureCallUrgentThresholdHours: Number(timeThresholds.future_call.urgent), futureCallWarningThresholdHours: Number(timeThresholds.future_call.warning),
                    appointmentUrgentThresholdHours: Number(timeThresholds.appointment.urgent), appointmentWarningThresholdHours: Number(timeThresholds.appointment.warning),
                    rescheduledUrgentThresholdHours: Number(timeThresholds.rescheduled.urgent), rescheduledWarningThresholdHours: Number(timeThresholds.rescheduled.warning),
                    noContactSeverity: conditionSeverities.no_contact,
                    followUpSeverity: conditionSeverities.follow_up,
                    futureCallSeverity: conditionSeverities.future_call,
                    appointmentSeverity: conditionSeverities.appointment,
                    rescheduledSeverity: conditionSeverities.rescheduled,
                  },
                  { onSuccess: () => setOpen(false) },
                );
              }}
            >
              Guardar configuración
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
