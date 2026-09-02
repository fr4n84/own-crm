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
} from "@crm-fran/ui/components/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";

import { useUpdateCalendarPreferences } from "./use-calendar";

export function CalendarSettingsDialog({
  agendaDurationMinutes,
}: {
  agendaDurationMinutes: number;
}) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(String(agendaDurationMinutes));
  const updatePreferences = useUpdateCalendarPreferences();
  const durationValue = Number(duration);
  const invalid =
    !Number.isInteger(durationValue) || durationValue < 5 || durationValue > 720;

  const openWithCurrentValue = () => {
    setDuration(String(agendaDurationMinutes));
    setOpen(true);
  };

  return (
    <>
      <Button variant="outline" onClick={openWithCurrentValue}>
        <Settings2 data-icon="inline-start" />
        Configuración
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración personal del calendario</DialogTitle>
            <DialogDescription>
              Define cuánto duran por defecto las agendas procedentes de leads.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="agenda-duration">Duración en minutos</FieldLabel>
              <Input
                id="agenda-duration"
                type="number"
                min={5}
                max={720}
                step={5}
                value={duration}
                aria-invalid={invalid}
                onChange={(event) => setDuration(event.target.value)}
              />
              <FieldDescription>Entre 5 minutos y 12 horas.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button
              disabled={invalid || updatePreferences.isPending}
              onClick={() =>
                updatePreferences.mutate(
                  { agendaDurationMinutes: durationValue },
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
