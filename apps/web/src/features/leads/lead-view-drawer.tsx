"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import type { QASessionItem } from "@/app/types";
import { CALLER_QUESTIONS, CLOSER_QUESTIONS } from "./qa-questions";
import { Button } from "@crm-fran/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm-fran/ui/components/tooltip";
import { Input } from "@crm-fran/ui/components/input";
import { Textarea } from "@crm-fran/ui/components/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@crm-fran/ui/components/tabs";
import { Label } from "@crm-fran/ui/components/label";
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

const QUESTIONS_BY_ROLE = {
  caller: CALLER_QUESTIONS,
  closer: CLOSER_QUESTIONS,
} as const;

function partitionQASession(items: readonly QASessionItem[]): {
  caller: QASessionItem[];
  closer: QASessionItem[];
} {
  const caller: QASessionItem[] = [];
  const closer: QASessionItem[] = [];
  for (const item of items) {
    if (item.authorRole === "closer") {
      closer.push(item);
    } else {
      caller.push(item);
    }
  }
  return { caller, closer };
}

function buildAnswersMap(items: QASessionItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    map[item.question] = item.answer;
  }
  return map;
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

  const { caller: callerItems, closer: closerItems } = partitionQASession(
    lead.questions ?? [],
  );

  return (
    <>
      <Tooltip><TooltipTrigger render={<Button
        variant={trigger ? "default" : "outline"}
        size={trigger ? "default" : "icon"}
        aria-label={triggerAriaLabel}
        onClick={() => setOpen(true)}
      />}>
        {trigger ?? <Eye data-icon="inline-start" />}
      </TooltipTrigger><TooltipContent>{triggerAriaLabel ?? "Ver detalles del lead"}</TooltipContent></Tooltip>

      <LeadDrawer
        open={open}
        onOpenChange={setOpen}
        title="Información del lead"
        description="Datos registrados durante la llamada."
        type="view"
        presentation="dialog"
      >
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full" variant="line">
            <TabsTrigger value="details" className="flex-1">
              Información
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">
              Actividad
            </TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="pt-4">
            <dl className="mb-6 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
              {[['Nombre', lead.name], ['Teléfono', lead.phone], ['Correo', lead.email], ['Estado', lead.state], ['Caller', lead.caller?.name], ['Closer', lead.closer?.name], ['Creado', lead.createdAt ? new Date(lead.createdAt).toLocaleString() : undefined], ['Actualizado', lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : undefined]].filter((item) => item[1]).map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{String(value)}</dd></div>)}
            </dl>
            <ReadOnlyQAView
              callerAnswers={callerItems}
              closerAnswers={closerItems}
              callerOnly={callerOnly}
            />
          </TabsContent>
          <TabsContent value="activity" className="pt-4">
            <LeadActivityTimeline leadId={lead.id} enabled={open} />
          </TabsContent>
        </Tabs>
      </LeadDrawer>
    </>
  );
}

function ReadOnlyQAView({
  callerAnswers,
  closerAnswers,
  callerOnly,
}: {
  callerAnswers: QASessionItem[];
  closerAnswers: QASessionItem[];
  callerOnly: boolean;
}) {
  if (callerOnly) {
    return (
      <div className="flex flex-col gap-3">
        <Label className="text-base font-semibold">Sesión del caller</Label>
        <ReadOnlySession
          role="caller"
          items={callerAnswers}
          emptyMessage="Aún no se registraron respuestas del caller"
        />
      </div>
    );
  }

  return (
    <>
      {/* Mobile: tabs */}
      <div className="md:hidden">
        <Tabs defaultValue="caller">
          <TabsList className="w-full">
            <TabsTrigger value="caller" className="flex-1">
              Sesión del caller
            </TabsTrigger>
            <TabsTrigger value="closer" className="flex-1">
              Sesión del closer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="caller">
            <div className="pt-4">
              <ReadOnlySession
                role="caller"
                items={callerAnswers}
                emptyMessage="Sin respuesta"
              />
            </div>
          </TabsContent>

          <TabsContent value="closer">
            <div className="pt-4">
              <ReadOnlySession
                role="closer"
                items={closerAnswers}
                emptyMessage="Sin respuesta"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: two-column grid */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-6">
        <div className="flex flex-col gap-3">
          <Label className="text-base font-semibold">Sesión del caller</Label>
          <ReadOnlySession
            role="caller"
            items={callerAnswers}
            emptyMessage="Aún no se registraron respuestas del caller"
          />
        </div>

        <div className="flex flex-col gap-3">
          <Label className="text-base font-semibold">Sesión del closer</Label>
          <ReadOnlySession
            role="closer"
            items={closerAnswers}
            emptyMessage="Aún no se registraron respuestas del closer"
          />
        </div>
      </div>
    </>
  );
}

function ReadOnlySession({
  role,
  items,
  emptyMessage,
}: {
  role: "caller" | "closer";
  items: QASessionItem[];
  emptyMessage: string;
}) {
  const questions = QUESTIONS_BY_ROLE[role];
  const existingAnswers = buildAnswersMap(items);
  const answeredQuestions = questions.filter((question) => Boolean(existingAnswers[question]?.trim()));

  if (answeredQuestions.length === 0) return <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>;

  return (
    <div className="space-y-4">

      {answeredQuestions.map((question) => {
        const answer = existingAnswers[question] ?? "";
        return (
          <div key={question} className="space-y-2">
            <span className="text-sm font-medium">{question}</span>
            {answer.length > 80 ? (
              <Textarea
                value={answer}
                disabled
                className="min-h-20 resize-none"
              />
            ) : answer ? (
              <Input value={answer} disabled />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
