import type { Permission } from "@crm-fran/db/schema/auth";
import { z } from "zod";

import { hasPermission } from "./permissions";

export const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe-2025-12-15";
export const SUMMARY_MODEL = "gpt-4o-mini-2024-07-18";
export const PRICING_VERSION = "openai-2026-08-20";
export const MONTHLY_REFERENCE_MINUTES = 5_000;

const nullableFormText = z.string().max(2_000);
const transcriptText = z.string().max(100_000);

export const FEEDBACK_PROFILES = [
  { value: "latino_extranjero", label: "Latino/extranjero" },
  { value: "mayor_edad_avanzada", label: "Mayor/edad avanzada" },
  { value: "closer_setter_comercial", label: "Closer/setter/comercial" },
  { value: "parado_desempleado", label: "Parado/desempleado" },
  { value: "familia_con_hijos", label: "Madre/padre o familia con hijos" },
  { value: "busca_ingreso_extra", label: "Busca una segunda fuente/ingreso extra" },
  { value: "autonomo_emprendedor", label: "Autónomo/emprendedor" },
  { value: "solo_busca_empleo", label: "Solo busca trabajo/empleo" },
  { value: "sin_recursos_no_invierte", label: "Sin recursos/no invierte" },
] as const;

export const MOTIVATION_ANGLES = [
  { value: "income_extra_to_primary", label: "Convertir el extra en fuente principal/dejar su empleo" },
  { value: "concrete_income_goal", label: "Meta de dinero concreta (1,5k–5k)/escalar" },
  { value: "time_freedom", label: "Libertad de tiempo/flexibilidad horaria" },
  { value: "remote_location_freedom", label: "Trabajar online/desde casa/ubicación libre" },
  { value: "combine_current_work", label: "Compaginar con su trabajo actual" },
  { value: "financial_stability", label: "Estabilidad/tranquilidad financiera" },
  { value: "burned_out_current_job", label: "Quemado/harto del trabajo actual" },
  { value: "family_quality_time", label: "Más tiempo/calidad de vida con la familia" },
] as const;

export const OBJECTION_TYPES = [
  { value: "price", label: "Precio o inversión" },
  { value: "timing", label: "No es el momento" },
  { value: "trust", label: "Confianza o credibilidad" },
  { value: "decision_maker", label: "Debe consultarlo con otra persona" },
  { value: "time_capacity", label: "Falta de tiempo o capacidad" },
  { value: "product_fit", label: "No ve encaje con la formación" },
  { value: "financing", label: "Financiación o liquidez" },
] as const;

export type FeedbackProfile = (typeof FEEDBACK_PROFILES)[number]["value"];
export type MotivationAngle = (typeof MOTIVATION_ANGLES)[number]["value"];
export type ObjectionType = (typeof OBJECTION_TYPES)[number]["value"];

const profileValues = FEEDBACK_PROFILES.map((profile) => profile.value) as [
  FeedbackProfile,
  ...FeedbackProfile[],
];
const motivationAngleValues = MOTIVATION_ANGLES.map((angle) => angle.value) as [
  MotivationAngle,
  ...MotivationAngle[],
];
const objectionTypeValues = OBJECTION_TYPES.map((item) => item.value) as [
  ObjectionType,
  ...ObjectionType[],
];

const confirmedTaxonomies = {
  motivationAngles: new Set<string>(motivationAngleValues),
  objectionTypes: new Set<string>(objectionTypeValues),
} as const;

export type ConfirmedFeedbackQuestion = { questionKey: string; question: string; answer: string };

export function validateConfirmedFeedbackQuestions(questions: readonly ConfirmedFeedbackQuestion[]) {
  for (const question of questions) {
    if (question.questionKey !== "motivationAngles" && question.questionKey !== "objectionTypes") continue;
    let values: unknown;
    try { values = JSON.parse(question.answer); } catch { throw new Error(`Invalid ${question.questionKey} answer`); }
    const allowed = confirmedTaxonomies[question.questionKey];
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !allowed.has(value))) {
      throw new Error(`Invalid ${question.questionKey} answer`);
    }
  }
  return questions;
}

export const callFeedbackDraftSchema = z
  .object({
    isContacted: z.enum(["", "Si", "No"]),
    outcome: z.enum([
      "",
      "future_call",
      "not_fit",
      "not_interested",
      "appointment",
    ]),
    primaryProfile: z.union([z.literal(""), z.enum(profileValues)]),
    subProfile: z.union([z.literal(""), z.enum(profileValues)]),
    motivationAngles: z.array(z.enum(motivationAngleValues)).max(MOTIVATION_ANGLES.length),
    objectionTypes: z.array(z.enum(objectionTypeValues)).max(OBJECTION_TYPES.length).optional().default([]),
    isDecisionMaker: z.enum(["", "Si", "No"]),
    decisionMakerName: nullableFormText,
    financialSource: nullableFormText,
    trainingAndPriceAwareness: nullableFormText,
    urgencyReason: nullableFormText,
    summary: nullableFormText,
    extraInfo: transcriptText,
    scheduledDate: z.union([z.literal(""), z.string().date()]),
    scheduledTime: z.union([
      z.literal(""),
      z.string().regex(/^\d{2}:\d{2}$/),
    ]),
    alertSeverity: z.enum(["", "urgent", "warning", "info"]),
  })
  .strict();

export type CallFeedbackDraft = z.infer<typeof callFeedbackDraftSchema>;

type CostEstimateInput = {
  durationMs: number;
  summaryInputTokens: number;
  summaryOutputTokens: number;
};

export function estimateCallFeedbackCostMicroUsd({
  durationMs,
  summaryInputTokens,
  summaryOutputTokens,
}: CostEstimateInput): number {
  const transcription = (durationMs / 60_000) * 3_000;
  const summaryInput = summaryInputTokens * 0.15;
  const summaryOutput = summaryOutputTokens * 0.6;
  return Math.round(transcription + summaryInput + summaryOutput);
}

export function canProcessLeadRecording({
  permissions,
  userId,
  callerId,
}: {
  permissions: Permission[];
  userId: string;
  callerId: string | null;
}): boolean {
  return permissions.includes("*") || callerId === userId;
}

const structuredDraftSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    isContacted: { type: "string", enum: ["", "Si", "No"] },
    outcome: {
      type: "string",
      enum: ["", "future_call", "not_fit", "not_interested", "appointment"],
    },
    primaryProfile: { type: "string", enum: ["", ...profileValues] },
    subProfile: { type: "string", enum: ["", ...profileValues] },
    motivationAngles: {
      type: "array",
      items: { type: "string", enum: motivationAngleValues },
    },
    objectionTypes: {
      type: "array",
      items: { type: "string", enum: objectionTypeValues },
    },
    isDecisionMaker: { type: "string", enum: ["", "Si", "No"] },
    decisionMakerName: { type: "string" },
    financialSource: { type: "string" },
    trainingAndPriceAwareness: { type: "string" },
    urgencyReason: { type: "string" },
    summary: { type: "string" },
    scheduledDate: { type: "string" },
    scheduledTime: { type: "string" },
    alertSeverity: {
      type: "string",
      enum: ["", "urgent", "warning", "info"],
    },
  },
  required: [
    "isContacted",
    "outcome",
    "primaryProfile",
    "subProfile",
    "motivationAngles",
    "objectionTypes",
    "isDecisionMaker",
    "decisionMakerName",
    "financialSource",
    "trainingAndPriceAwareness",
    "urgencyReason",
    "summary",
    "scheduledDate",
    "scheduledTime",
    "alertSeverity",
  ],
} as const;

export class CallFeedbackAccessError extends Error {}
export class CallFeedbackLeadNotFoundError extends Error {}

export type CallFeedbackUsageRecord = {
  userId: string;
  leadId: string;
  processedDurationMs: number;
  transcriptionModel: string;
  summaryModel: string;
  estimatedCostMicroUsd: number;
  pricingVersion: string;
};

export type CallFeedbackDependencies = {
  findLead: (leadId: string) => Promise<{ id: string; callerId: string | null } | undefined>;
  transcribe: (audio: File) => Promise<string>;
  summarize: (transcript: string) => Promise<{
    outputText: string;
    inputTokens: number;
    outputTokens: number;
  }>;
  recordUsage: (usage: CallFeedbackUsageRecord) => Promise<void>;
};

export async function processCallRecording({
  audio,
  durationMs,
  leadId,
  userId,
  permissions,
  dependencies,
}: {
  audio: File;
  durationMs: number;
  leadId: string;
  userId: string;
  permissions: Permission[];
  dependencies: CallFeedbackDependencies;
}) {
  if (!hasPermission(permissions, ["leads:write"])) {
    throw new CallFeedbackAccessError("Permission denied");
  }

  const lead = await dependencies.findLead(leadId);

  if (!lead) {
    throw new CallFeedbackLeadNotFoundError("Lead not found");
  }
  if (!canProcessLeadRecording({ permissions, userId, callerId: lead.callerId })) {
    throw new CallFeedbackAccessError("Lead is not assigned to this caller");
  }

  const transcript = await dependencies.transcribe(audio);
  const response = await dependencies.summarize(transcript);
  const draft = callFeedbackDraftSchema.parse({
    ...JSON.parse(response.outputText),
    extraInfo: transcript,
  });
  const estimatedCostMicroUsd = estimateCallFeedbackCostMicroUsd({
    durationMs,
    summaryInputTokens: response.inputTokens,
    summaryOutputTokens: response.outputTokens,
  });

  await dependencies.recordUsage({
    userId,
    leadId,
    processedDurationMs: durationMs,
    transcriptionModel: TRANSCRIPTION_MODEL,
    summaryModel: SUMMARY_MODEL,
    estimatedCostMicroUsd,
    pricingVersion: PRICING_VERSION,
  });

  return {
    draft,
    usage: { durationMs, estimatedCostMicroUsd },
  };
}

export { structuredDraftSchema };
