"use client";

import { Settings2 } from "lucide-react";
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
  DialogTrigger,
} from "@crm-fran/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";

import { useUpdateRankingSettings } from "./use-rankings";

type Settings = {
  callerLeadTakenPoints: number;
  callerAppointmentPoints: number;
  callerShowPoints: number;
  closerSalePoints: number;
  closerFollowUpShowPoints: number;
};

const FIELDS: Array<{ key: keyof Settings; label: string }> = [
  { key: "callerLeadTakenPoints", label: "Lead cogido por caller" },
  { key: "callerAppointmentPoints", label: "Agenda creada por caller" },
  { key: "callerShowPoints", label: "Show conseguido por caller" },
  { key: "closerSalePoints", label: "Venta cerrada por closer" },
  { key: "closerFollowUpShowPoints", label: "Seguimiento convertido en show" },
];

export function RankingSettingsDialog({ settings }: { settings: Settings }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      FIELDS.map((field) => [field.key, String(settings[field.key])]),
    ) as Record<keyof Settings, string>,
  );
  const updateSettings = useUpdateRankingSettings();
  const parsed = Object.fromEntries(
    FIELDS.map((field) => [field.key, Number(values[field.key])]),
  ) as Settings;
  const invalid = Object.values(parsed).some(
    (value) => !Number.isInteger(value) || value < 0 || value > 1000,
  );

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <Settings2 data-icon="inline-start" />
        Configurar puntos
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Puntuación de la liga general</DialogTitle>
          <DialogDescription>
            Define cuántos puntos aporta cada acción. Los resultados mensuales ya cerrados no cambian.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`ranking-${field.key}`}>{field.label}</FieldLabel>
              <Input
                id={`ranking-${field.key}`}
                type="number"
                min={0}
                max={1000}
                value={values[field.key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            disabled={invalid || updateSettings.isPending}
            onClick={() => updateSettings.mutate(parsed)}
          >
            Guardar puntuación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
