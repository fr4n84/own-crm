"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Eye } from "lucide-react";

import { Button } from "@crm-fran/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm-fran/ui/components/tooltip";

import type { QASessionItem } from "@/app/types";
import LeadDrawer from "@/components/lead-drawer/lead-drawer";
import { LeadActivityTimeline } from "./lead-activity-timeline";

export interface LeadDetailsData {
  id: string;
  questions: QASessionItem[];
  feedback?: string;
  name?: string;
  email?: string | null;
  phone?: string;
  state?: string;
  caller?: { name: string } | null;
  closer?: { name: string } | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export default function LeadViewDrawer({
  lead,
  trigger,
  triggerAriaLabel,
  callerOnly = false,
}: {
  lead: LeadDetailsData;
  trigger?: ReactNode;
  triggerAriaLabel?: string;
  callerOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const accessibleTriggerLabel = triggerAriaLabel ?? "Ver detalles del lead";

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={(
            <Button
              variant={trigger ? "default" : "outline"}
              size={trigger ? "default" : "icon"}
              aria-label={accessibleTriggerLabel}
              onClick={() => setOpen(true)}
            />
          )}
        >
          {trigger ?? <Eye data-icon="inline-start" />}
        </TooltipTrigger>
        <TooltipContent>{accessibleTriggerLabel}</TooltipContent>
      </Tooltip>

      <LeadDrawer
        open={open}
        onOpenChange={setOpen}
        title="Información del lead"
        description="Datos registrados durante la llamada."
        type="view"
        presentation="dialog"
      >
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full" variant="line" aria-label="Vistas del lead">
            <TabsTrigger value="details" className="flex-1">
              Información
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">
              Actividad
            </TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="pt-4">
            <dl className="mb-6 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Nombre", lead.name],
                ["Teléfono", lead.phone],
                ["Correo", lead.email],
                ["Estado", lead.state],
                ["Caller", lead.caller?.name],
                ["Closer", lead.closer?.name],
                ["Creado", lead.createdAt ? new Date(lead.createdAt).toLocaleString() : undefined],
                ["Actualizado", lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : undefined],
              ].filter((item) => item[1]).map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>

            {lead.feedback?.trim() ? (
              <section aria-label="Feedback histórico" className="mb-6 flex flex-col gap-2 rounded-lg border p-4">
                <h3 className="font-semibold">Feedback histórico</h3>
                <p className="whitespace-pre-wrap break-words text-sm">{lead.feedback}</p>
              </section>
            ) : null}

            <CurrentQuestions questions={lead.questions ?? []} callerOnly={callerOnly} />
          </TabsContent>
          <TabsContent value="activity" className="pt-4">
            <LeadActivityTimeline leadId={lead.id} enabled={open} />
          </TabsContent>
        </Tabs>
      </LeadDrawer>
    </>
  );
}

function CurrentQuestions({
  questions,
  callerOnly,
}: {
  questions: readonly QASessionItem[];
  callerOnly: boolean;
}) {
  const visibleQuestions = callerOnly
    ? questions.filter((question) => question.authorRole === "caller")
    : questions;
  const title = callerOnly ? "Preguntas del caller" : "Preguntas actuales";

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="font-semibold">{title}</h3>
      {visibleQuestions.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">Sin preguntas registradas</p>
      ) : (
        <dl className="flex flex-col gap-4">
          {visibleQuestions.map((item, index) => (
            <div
              key={`${item.authorRole}:${item.questionKey ?? item.question}:${index}`}
              className="flex flex-col gap-1 rounded-lg border p-3"
            >
              <dt className="text-sm font-medium">
                {item.question.trim() || item.questionKey?.trim() || "Pregunta sin etiqueta"}
              </dt>
              <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {item.answer || "Sin respuesta"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
