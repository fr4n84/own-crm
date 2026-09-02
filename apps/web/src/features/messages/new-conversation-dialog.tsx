"use client";

import { MessageSquarePlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";

import { useStartConversation } from "./use-messages";

type MessageUser = { id: string; name: string; email: string; roleId: string };

export function NewConversationDialog({
  users,
  onConversationOpened,
}: {
  users: readonly MessageUser[];
  onConversationOpened: (conversationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const startConversation = useStartConversation();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <MessageSquarePlus data-icon="inline-start" />
        Nuevo chat
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva conversación</DialogTitle>
          <DialogDescription>
            Selecciona cualquier usuario del CRM para empezar a comunicarte.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Usuario</FieldLabel>
            <Select value={participantId} onValueChange={(value) => setParticipantId(value ?? "")}>
              <SelectTrigger aria-label="Seleccionar usuario">
                <SelectValue placeholder="Selecciona un usuario" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {users.map((messageUser) => (
                    <SelectItem key={messageUser.id} value={messageUser.id}>
                      {messageUser.name} · {messageUser.email}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            disabled={!participantId || startConversation.isPending}
            onClick={() =>
              startConversation.mutate(
                { participantId },
                {
                  onSuccess: (conversation) => {
                    if (conversation) onConversationOpened(conversation.id);
                    setOpen(false);
                    setParticipantId("");
                  },
                },
              )
            }
          >
            Abrir conversación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
