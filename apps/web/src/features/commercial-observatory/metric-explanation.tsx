"use client";

import { InfoIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@crm-fran/ui/components/dialog";

export type Explanation = {
  id: string;
  version: string;
  title: string;
  meaning: string;
  formula: string;
  unit: string;
  sources: readonly string[];
  period: { from: Date | string; to: Date | string; asOf: Date | string; timeZone: string; boundary: string };
  syntheticExample: { scenario: string; result: string };
  limitations: readonly string[];
  evidence: {
    dataQuality: { state: "available" | "limited" | "unavailable"; explanation: string };
    statisticalConfidence: { state: "descriptive" | "moderate" | "insufficient"; explanation: string };
  };
  humanRecommendation: string;
};

const evidenceLabel = {
  available: "Disponible",
  limited: "Limitada",
  unavailable: "No disponible",
  descriptive: "Descriptiva",
  moderate: "Moderada",
  insufficient: "Insuficiente",
} as const;

const dateLabel = (value: Date | string) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium" }).format(value instanceof Date ? value : new Date(value));

function ExplanationSections({ explanation, nested = false }: { explanation: Explanation; nested?: boolean }) {
  const Heading = nested ? "h4" : "h3";

  return (
    <>
      <div className="grid gap-5 text-sm sm:grid-cols-2">
        <section className="grid gap-2"><Heading className="font-semibold">Cálculo</Heading><p>{explanation.formula}</p><p><span className="text-muted-foreground">Unidad:</span> {explanation.unit}</p></section>
        <section className="grid gap-2"><Heading className="font-semibold">Periodo y fuentes</Heading><p>{dateLabel(explanation.period.from)}–{dateLabel(explanation.period.to)} · cierre {dateLabel(explanation.period.asOf)}</p><p>{explanation.period.timeZone} · intervalo {explanation.period.boundary}</p><ul className="list-disc pl-5">{explanation.sources.map((source) => <li key={source}>{source}</li>)}</ul></section>
        <section className="grid gap-2"><Heading className="font-semibold">Ejemplo sintético</Heading><p>{explanation.syntheticExample.scenario}</p><p className="font-medium">{explanation.syntheticExample.result}</p></section>
        <section className="grid gap-2"><Heading className="font-semibold">Limitaciones</Heading><ul className="list-disc pl-5">{explanation.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>
        <section className="grid gap-2 rounded-md border p-3"><div className="flex items-center justify-between gap-2"><Heading className="font-semibold">Calidad de datos</Heading><Badge variant={explanation.evidence.dataQuality.state === "available" ? "secondary" : "outline"}>{evidenceLabel[explanation.evidence.dataQuality.state]}</Badge></div><p>{explanation.evidence.dataQuality.explanation}</p></section>
        <section className="grid gap-2 rounded-md border p-3"><div className="flex items-center justify-between gap-2"><Heading className="font-semibold">Confianza estadística</Heading><Badge variant={explanation.evidence.statisticalConfidence.state === "moderate" ? "secondary" : "outline"}>{evidenceLabel[explanation.evidence.statisticalConfidence.state]}</Badge></div><p>{explanation.evidence.statisticalConfidence.explanation}</p></section>
      </div>
      <section className="rounded-md bg-muted p-3 text-sm"><Heading className="font-semibold">Recomendación humana</Heading><p>{explanation.humanRecommendation}</p></section>
    </>
  );
}

function ExplanationTrigger({ label }: { label: string }) {
  return (
    <DialogTrigger render={<Button variant="ghost" size="icon-xs" className="size-11 shrink-0" aria-label={label} />}>
      <InfoIcon aria-hidden="true" />
    </DialogTrigger>
  );
}

export function MetricExplanation({ explanation, label }: { explanation: Explanation; label?: string }) {
  return (
    <Dialog>
      <ExplanationTrigger label={label ?? `Explicar ${explanation.title}`} />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2"><DialogTitle>{explanation.title}</DialogTitle><Badge variant="outline">{explanation.version}</Badge></div>
          <DialogDescription>{explanation.meaning}</DialogDescription>
        </DialogHeader>
        <ExplanationSections explanation={explanation} />
      </DialogContent>
    </Dialog>
  );
}

export function MetricExplanationGroup({
  explanations,
  label,
  title,
}: {
  explanations: readonly Explanation[];
  label: string;
  title: string;
}) {
  return (
    <Dialog>
      <ExplanationTrigger label={label} />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Cada métrica conserva su cálculo, periodo, calidad y confianza.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {explanations.map((explanation) => (
            <article key={explanation.id} className="flex flex-col gap-4 rounded-lg border p-4">
              <header className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{explanation.title}</h3><Badge variant="outline">{explanation.version}</Badge></div>
                <p className="text-sm text-muted-foreground">{explanation.meaning}</p>
              </header>
              <ExplanationSections explanation={explanation} nested />
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
