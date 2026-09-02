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

import {
  getAppointmentOutcomeLabel,
} from "./alert-resolution";
import type { Alert } from "./use-alerts";

interface AlertResolutionDialogProps {
  alert: Alert;
}

export function AlertResolutionDialog({ alert }: AlertResolutionDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const formId = `resolve-alert-${alert.id}`;

  if (!alert.lead) return null;

  const closeAndRefresh = async () => {
    setOpen(false);
    await queryClient.invalidateQueries({
      queryKey: trpc.alerts.listAlerts.queryKey(),
    });
    await queryClient.invalidateQueries({
      queryKey: trpc.alerts.countAlerts.queryKey(),
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Resolver
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar resultado de la alerta</DialogTitle>
            <DialogDescription>
              Indica qué ocurrió con {alert.lead.name}. El resultado actualizará
              esta alerta o generará la siguiente cuando corresponda.
            </DialogDescription>
          </DialogHeader>

          <AssignLeadForm
            leadId={alert.lead.id}
            leadQuestions={alert.lead.questions}
            currentCloserId={alert.lead.closer?.id}
            freshEvent
            appointmentOutcomeLabel={getAppointmentOutcomeLabel(alert.kind)}
            formId={formId}
            sourceAlertId={alert.id}
            onSuccess={() => void closeAndRefresh()}
          />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" form={formId}>
              Guardar resultado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
