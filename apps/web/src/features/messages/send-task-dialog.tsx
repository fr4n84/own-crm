"use client";

import { ListTodo } from "lucide-react";
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
import { Textarea } from "@crm-fran/ui/components/textarea";

import { useSendTask } from "./use-messages";

export function SendTaskDialog({
  conversationId,
  assignee,
}: {
  conversationId: string;
  assignee: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const sendTask = useSendTask();

  const reset = () => {
    setTitle("");
    setDescription("");
    setDueAt("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ListTodo data-icon="inline-start" />
        Enviar tarea
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar tarea a {assignee.name}</DialogTitle>
          <DialogDescription>
            La tarea aparecerá dentro del chat y podrás comprobar cuándo se complete.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="message-task-title">Título</FieldLabel>
            <Input id="message-task-title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="message-task-description">Descripción</FieldLabel>
            <Textarea id="message-task-description" maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="message-task-due">Fecha límite opcional</FieldLabel>
            <Input id="message-task-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            disabled={!title.trim() || sendTask.isPending}
            onClick={() =>
              sendTask.mutate(
                {
                  conversationId,
                  title: title.trim(),
                  description: description.trim() || undefined,
                  assigneeId: assignee.id,
                  dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            Enviar tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
