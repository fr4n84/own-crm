import { and, db, eq, gte, lt, sql } from "@crm-fran/db";
import { callFeedbackUsage, leads } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { env } from "@crm-fran/env/server";
import OpenAI from "openai";

import {
  MONTHLY_REFERENCE_MINUTES,
  PRICING_VERSION,
  SUMMARY_MODEL,
  TRANSCRIPTION_MODEL,
  processCallRecording,
  structuredDraftSchema,
} from "./call-feedback";
import type {
  CallFeedbackDependencies,
  CallFeedbackUsageRecord,
} from "./call-feedback";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const dependencies: CallFeedbackDependencies = {
  async findLead(leadId) {
    const [lead] = await db
      .select({ id: leads.id, callerId: leads.callerId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    return lead;
  },
  async transcribe(audio) {
    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: TRANSCRIPTION_MODEL,
      response_format: "json",
    });
    return transcription.text;
  },
  async summarize(transcript) {
    const response = await openai.responses.create({
      model: SUMMARY_MODEL,
      store: false,
      instructions:
        "Extract a conservative CRM feedback draft from the Spanish call transcript. " +
        "Never invent facts. Use empty strings when information is absent or uncertain. " +
        "Classify profiles only from explicit statements. Never infer nationality, age, family status, employment, profession, or finances. " +
        "Choose one primaryProfile using this precedence: latino_extranjero, mayor_edad_avanzada, closer_setter_comercial, parado_desempleado, familia_con_hijos, then the remaining applicable profile. " +
        "When latino_extranjero is explicit, use it as primaryProfile and preserve the next applicable profile in subProfile; otherwise leave subProfile empty. " +
        "Select every explicitly stated motivation angle. Do not evaluate or score the caller's sales technique. " +
        "Write a concise factual summary in summary. " +
        "In trainingAndPriceAwareness, state only whether the lead understands that the product is training and whether they know its price. " +
        "Extract the stated source of financial capacity and the reason for urgency when available. " +
        "The human caller will review every field before saving. For dates, return YYYY-MM-DD only when explicitly unambiguous.",
      input: transcript,
      text: {
        format: {
          type: "json_schema",
          name: "call_feedback_draft",
          strict: true,
          schema: structuredDraftSchema,
        },
      },
    });
    return {
      outputText: response.output_text,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
  },
  async recordUsage(usage: CallFeedbackUsageRecord) {
    await db.insert(callFeedbackUsage).values({ id: crypto.randomUUID(), ...usage });
  },
};

export function processProductionCallRecording(input: {
  audio: File;
  durationMs: number;
  leadId: string;
  userId: string;
  permissions: Permission[];
}) {
  return processCallRecording({ ...input, dependencies });
}

export async function getMonthlyCallFeedbackUsage(now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [usage] = await db
    .select({
      processedDurationMs: sql<number>`coalesce(sum(${callFeedbackUsage.processedDurationMs}), 0)::int`,
      estimatedCostMicroUsd: sql<number>`coalesce(sum(${callFeedbackUsage.estimatedCostMicroUsd}), 0)::int`,
      recordings: sql<number>`count(*)::int`,
    })
    .from(callFeedbackUsage)
    .where(
      and(
        gte(callFeedbackUsage.createdAt, monthStart),
        lt(callFeedbackUsage.createdAt, nextMonthStart),
      ),
    );

  return {
    processedDurationMs: usage?.processedDurationMs ?? 0,
    estimatedCostMicroUsd: usage?.estimatedCostMicroUsd ?? 0,
    recordings: usage?.recordings ?? 0,
    referenceMinutes: MONTHLY_REFERENCE_MINUTES,
    pricingVersion: PRICING_VERSION,
  };
}
