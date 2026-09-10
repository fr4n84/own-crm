import { z } from "zod";

export const COACHING_POLICY_VERSION = "commercial-coaching-v1";
export const COACHING_EVIDENCE_SIGNALS = [
  "clear_open_question",
  "confirmed_need",
  "confirmed_objection",
  "clear_next_step",
  "missing_discovery",
  "unsupported_claim",
  "evidence_insufficient",
] as const;
export const COACHING_REVIEW_REASONS = [
  "uncertain_evidence",
  "sensitive_financial_context",
  "potential_compliance_issue",
] as const;

export const coachingAnalysisDraftSchema = z.object({
  rubricVersion: z.string().trim().min(1).max(100),
  criteria: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    rating: z.enum(["strength", "improve", "unknown"]),
    evidenceSignals: z.array(z.enum(COACHING_EVIDENCE_SIGNALS)).max(8),
    recommendation: z.string().trim().max(500),
  }).strict()).min(1).max(12),
  summary: z.string().trim().min(1).max(1_000),
  requiresPersonalReview: z.boolean(),
  reviewReasons: z.array(z.enum(COACHING_REVIEW_REASONS)).max(3),
}).strict();

export type CoachingAnalysisDraft = z.infer<typeof coachingAnalysisDraftSchema>;
export type CoachingRole = "caller" | "closer";

export const coachingAnalysisJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    rubricVersion: { type: "string" },
    criteria: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      key: { type: "string" }, rating: { type: "string", enum: ["strength", "improve", "unknown"] }, evidenceSignals: { type: "array", items: { type: "string", enum: COACHING_EVIDENCE_SIGNALS } }, recommendation: { type: "string" },
    }, required: ["key", "rating", "evidenceSignals", "recommendation"] } },
    summary: { type: "string" }, requiresPersonalReview: { type: "boolean" }, reviewReasons: { type: "array", items: { type: "string", enum: COACHING_REVIEW_REASONS } },
  }, required: ["rubricVersion", "criteria", "summary", "requiresPersonalReview", "reviewReasons"],
} as const;

export type CoachingRubricCandidate = {
  id: string;
  version: string;
  role: CoachingRole;
  product: string | null;
  campaign: string | null;
  active: boolean;
};

export function selectCoachingRubric({ rubrics, role, product, campaign }: {
  rubrics: readonly CoachingRubricCandidate[];
  role: CoachingRole;
  product: string | null;
  campaign: string | null;
}) {
  return rubrics
    .filter((rubric) => rubric.active && rubric.role === role)
    .filter((rubric) => !rubric.product || rubric.product === product)
    .filter((rubric) => !rubric.campaign || rubric.campaign === campaign)
    .sort((left, right) => Number(Boolean(right.product)) + Number(Boolean(right.campaign)) - Number(Boolean(left.product)) - Number(Boolean(left.campaign)))[0] ?? null;
}

export function buildCoachingCohortComparison(rows: readonly {
  agentId: string;
  role: CoachingRole;
  difficulty: string;
  criteria: readonly { key: string; rating: "strength" | "improve" | "unknown" }[];
}[]) {
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.role}:${row.difficulty}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].flatMap((group) => {
    const agents = [...new Set(group.map((row) => row.agentId))];
    if (group.length < 5 || agents.length < 3) return [];
    const keys = [...new Set(group.flatMap((row) => row.criteria.map((criterion) => criterion.key)))].sort();
    const criteria = keys.flatMap((key) => {
      const comparable = group.flatMap((row) => row.criteria.filter((item) => item.key === key && item.rating !== "unknown"));
      if (comparable.length === 0) return [];
      const perAgentRates = agents.flatMap((agentId) => {
        const own = group.filter((row) => row.agentId === agentId).flatMap((row) => row.criteria.filter((item) => item.key === key && item.rating !== "unknown"));
        return own.length === 0 ? [] : [own.filter((item) => item.rating === "strength").length / own.length];
      });
      if (perAgentRates.length === 0) return [];
      return [{ key, strengthRate: Math.round(perAgentRates.reduce((sum, rate) => sum + rate, 0) / perAgentRates.length * 100), comparableSample: comparable.length }];
    });
    return [{ role: group[0]!.role, difficulty: group[0]!.difficulty, sample: group.length, agentSample: agents.length, criteria, notice: "Comparación agregada y anónima; no clasifica personas ni llamadas." as const }];
  });
}
