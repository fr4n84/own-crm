"use client";

import { InfoIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@crm-fran/ui/components/dialog";

type Explanation = {
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

export function MetricExplanation({ explanation, label }: { explanation: Explanation; label?: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" className="size-11 shrink-0" aria-label={label ?? `Explicar ${explanation.title}`} />}>
        <InfoIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2"><DialogTitle>{explanation.title}</DialogTitle><Badge variant="outline">{explanation.version}</Badge></div>
          <DialogDescription>{explanation.meaning}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 text-sm sm:grid-cols-2">
          <section className="grid gap-2"><h3 className="font-semibold">Cálculo</h3><p>{explanation.formula}</p><p><span className="text-muted-foreground">Unidad:</span> {explanation.unit}</p></section>
          <section className="grid gap-2"><h3 className="font-semibold">Periodo y fuentes</h3><p>{dateLabel(explanation.period.from)}–{dateLabel(explanation.period.to)} · cierre {dateLabel(explanation.period.asOf)}</p><p>{explanation.period.timeZone} · intervalo {explanation.period.boundary}</p><ul className="list-disc pl-5">{explanation.sources.map((source) => <li key={source}>{source}</li>)}</ul></section>
          <section className="grid gap-2"><h3 className="font-semibold">Ejemplo sintético</h3><p>{explanation.syntheticExample.scenario}</p><p className="font-medium">{explanation.syntheticExample.result}</p></section>
          <section className="grid gap-2"><h3 className="font-semibold">Limitaciones</h3><ul className="list-disc pl-5">{explanation.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>
          <section className="grid gap-2 rounded-md border p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Calidad de datos</h3><Badge variant={explanation.evidence.dataQuality.state === "available" ? "secondary" : "outline"}>{evidenceLabel[explanation.evidence.dataQuality.state]}</Badge></div><p>{explanation.evidence.dataQuality.explanation}</p></section>
          <section className="grid gap-2 rounded-md border p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Confianza estadística</h3><Badge variant={explanation.evidence.statisticalConfidence.state === "moderate" ? "secondary" : "outline"}>{evidenceLabel[explanation.evidence.statisticalConfidence.state]}</Badge></div><p>{explanation.evidence.statisticalConfidence.explanation}</p></section>
        </div>
        <section className="rounded-md bg-muted p-3 text-sm"><h3 className="font-semibold">Recomendación humana</h3><p>{explanation.humanRecommendation}</p></section>
      </DialogContent>
    </Dialog>
  );
}
