"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

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
import { isCallerRoleId, isCloserRoleId } from "@/lib/role-capabilities";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";

import { formatLocalDate } from "../agendas/agenda-utils";
import { useCreateCalendarEvent } from "./use-calendar";

type Assignee = { id: string; name: string; roleId: string };

export function CalendarEventDialog({
  assignees,
  defaultDuration,
}: {
  assignees: readonly Assignee[];
  defaultDuration: number;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => formatLocalDate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(String(defaultDuration));
  const [callerId, setCallerId] = useState("none");
  const [closerId, setCloserId] = useState("none");
  const createEvent = useCreateCalendarEvent();
  const callers = assignees.filter((person) => isCallerRoleId(person.roleId));
  const closers = assignees.filter((person) => isCloserRoleId(person.roleId));
  const durationValue = Number(duration);
  const invalid =
    !title.trim() ||
    !date ||
    !startTime ||
    !Number.isInteger(durationValue) ||
    durationValue < 5 ||
    durationValue > 720;

  const reset = () => {
    setTitle("");
    setDate(formatLocalDate(new Date()));
    setStartTime("09:00");
    setDuration(String(defaultDuration));
    setCallerId("none");
    setCloserId("none");
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        Nueva cita
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva cita</DialogTitle>
            <DialogDescription>
              Añade un evento y asígnalo opcionalmente a un caller, un closer o ambos.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="calendar-event-title">Título</FieldLabel>
              <Input
                id="calendar-event-title"
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="calendar-event-date">Fecha</FieldLabel>
              <Input
                id="calendar-event-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="calendar-event-time">Hora</FieldLabel>
              <Input
                id="calendar-event-time"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="calendar-event-duration">Duración</FieldLabel>
              <Input
                id="calendar-event-duration"
                type="number"
                min={5}
                max={720}
                step={5}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Caller</FieldLabel>
              <Select value={callerId} onValueChange={(value) => setCallerId(value ?? "none")}>
                <SelectTrigger aria-label="Asignar caller">
                  <SelectValue placeholder="Sin caller" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">Sin caller</SelectItem>
                    {callers.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Closer</FieldLabel>
              <Select value={closerId} onValueChange={(value) => setCloserId(value ?? "none")}>
                <SelectTrigger aria-label="Asignar closer">
                  <SelectValue placeholder="Sin closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">Sin closer</SelectItem>
                    {closers.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button
              disabled={invalid || createEvent.isPending}
              onClick={() =>
                createEvent.mutate(
                  {
                    title: title.trim(),
                    date,
                    startTime,
                    durationMinutes: durationValue,
                    callerId: callerId === "none" ? null : callerId,
                    closerId: closerId === "none" ? null : closerId,
                  },
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              Añadir cita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CalendarEventDetailsDialog({
  title,
  durationMinutes,
  callerName,
  closerName,
  trigger,
}: {
  title: string;
  durationMinutes: number;
  callerName?: string;
  closerName?: string;
  trigger: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" aria-label={`Ver ${title}`} />}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Evento manual del calendario.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 text-sm">
          <div><dt className="font-medium">Duración</dt><dd>{durationMinutes} minutos</dd></div>
          <div><dt className="font-medium">Caller</dt><dd>{callerName ?? "Sin asignar"}</dd></div>
          <div><dt className="font-medium">Closer</dt><dd>{closerName ?? "Sin asignar"}</dd></div>
        </dl>
        <DialogClose render={<Button variant="outline" />}>Cerrar</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
