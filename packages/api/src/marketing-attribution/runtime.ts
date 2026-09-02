import { env } from "@crm-fran/env/server";
import OpenAI from "openai";

import { SUMMARY_MODEL, TRANSCRIPTION_MODEL } from "../call-feedback";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const marketingAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    angleSuggestion: { type: ["string", "null"] },
    hook: { type: ["string", "null"] },
    promise: { type: ["string", "null"] },
    cta: { type: ["string", "null"] },
    targetProfile: { type: ["string", "null"] },
    objections: { type: "array", items: { type: "string" } },
    awarenessStage: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "angleSuggestion",
    "hook",
    "promise",
    "cta",
    "targetProfile",
    "objections",
    "awarenessStage",
    "confidence",
  ],
} as const;

export async function transcribeMarketingAsset(file: File) {
  const response = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIPTION_MODEL,
    response_format: "json",
  });
  return response.text;
}

export async function analyzeMarketingTranscript(transcript: string) {
  const response = await openai.responses.create({
    model: SUMMARY_MODEL,
    store: false,
    instructions:
      "Analiza de forma conservadora una transcripción publicitaria en español. " +
      "Extrae únicamente información explícita. No inventes el público, el ángulo, la promesa ni las objeciones. " +
      "Devuelve null o una lista vacía cuando falte evidencia. El resultado es una sugerencia que aprobará una persona. " +
      "awarenessStage solo puede describir el nivel de consciencia observado en el mensaje, sin atribuir rasgos sensibles.",
    input: transcript,
    text: {
      format: {
        type: "json_schema",
        name: "marketing_creative_analysis",
        strict: true,
        schema: marketingAnalysisSchema,
      },
    },
  });
  const parsed = JSON.parse(response.output_text) as {
    angleSuggestion: string | null;
    hook: string | null;
    promise: string | null;
    cta: string | null;
    targetProfile: string | null;
    objections: string[];
    awarenessStage: string | null;
    confidence: number;
  };
  return {
    ...parsed,
    model: SUMMARY_MODEL,
    analyzedAt: new Date().toISOString(),
  };
}
