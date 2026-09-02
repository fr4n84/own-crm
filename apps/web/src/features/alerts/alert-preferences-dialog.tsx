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
  AlertRelevanceSeverity,
  AlertRelevanceMode,
  AlertRelevancePreferences,
  ConfigurableAlertKind,
} from "./alert-relevance";
import { useUpdateAlertPreferences } from "./use-alerts";

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

const SEVERITY_LABELS: Record<AlertRelevanceSeverity, string> = {
  urgent: "Alta",
  warning: "Media",
  info: "Baja",
};

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
  const updatePreferences = useUpdateAlertPreferences();
  const urgent = Number(urgentHours);
  const warning = Number(warningHours);
  const thresholdsInvalid =
    !Number.isInteger(urgent) ||
    !Number.isInteger(warning) ||
    urgent < 0 ||
    warning <= urgent;

  const openWithCurrentPreferences = () => {
    setMode(preferences.mode);
    setUrgentHours(String(preferences.urgentThresholdHours));
    setWarningHours(String(preferences.warningThresholdHours));
    setConditionSeverities(preferences.conditionSeverities);
    setOpen(true);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openWithCurrentPreferences}>
        Configurar relevancia
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
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
                          {SEVERITY_LABELS[conditionSeverities[kind]]}
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
              disabled={thresholdsInvalid || updatePreferences.isPending}
              onClick={() => {
                updatePreferences.mutate(
                  {
                    relevanceMode: mode,
                    urgentThresholdHours: urgent,
                    warningThresholdHours: warning,
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
