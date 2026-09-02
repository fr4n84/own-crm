"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

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

import AssignLeadForm from "@/features/leads/assign-lead-form";
import { trpc } from "@/utils/trpc";

import type { AgendaLead } from "./agenda-utils";

export function AgendaRescheduleDialog({ lead }: { lead: AgendaLead }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const formId = `reschedule-agenda-${lead.id}`;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reagendar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reagendar cita</DialogTitle>
            <DialogDescription>
              Registra el nuevo suceso y la próxima fecha de {lead.name}. La cita
              vigente pasará automáticamente al historial.
            </DialogDescription>
          </DialogHeader>

          <AssignLeadForm
            leadId={lead.id}
            leadQuestions={lead.questions}
            currentCloserId={lead.closer?.id}
            freshEvent
            appointmentOutcomeLabel="Reagenda"
            allowedOutcomes={["appointment"]}
            formId={formId}
            onSuccess={() => {
              setOpen(false);
              void queryClient.invalidateQueries({
                queryKey: trpc.leads.listAll.queryKey(),
              });
              void queryClient.invalidateQueries({
                queryKey: trpc.alerts.listAlerts.queryKey(),
              });
              void queryClient.invalidateQueries({
                queryKey: trpc.alerts.countAlerts.queryKey(),
              });
            }}
          />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" form={formId}>
              Guardar reagenda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
