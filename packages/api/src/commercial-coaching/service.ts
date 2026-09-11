import { and, db, desc, eq } from "@crm-fran/db";
import { commercialCoachingAnalyses, commercialCoachingRubrics } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";

import { buildCoachingCohortComparison, coachingAnalysisDraftSchema, selectCoachingRubric, type CoachingAnalysisDraft, type CoachingRole } from "./domain";

const has = (permissions: readonly Permission[], permission: Permission) => permissions.includes("*") || permissions.includes("coaching:*") || permissions.includes(permission);
export function canReadCoaching(input: { actorId: string; targetUserId: string; permissions: readonly Permission[] }) { return input.actorId === input.targetUserId || has(input.permissions, "coaching:read"); }
export function canReviewCoaching(input: { actorId: string; targetUserId: string; permissions: readonly Permission[] }) { return input.actorId === input.targetUserId || has(input.permissions, "coaching:review"); }
export function canGenerateCoaching(input: { actorId: string; targetUserId: string; permissions: readonly Permission[] }) { return input.actorId === input.targetUserId || input.permissions.includes("*"); }

export async function recordCoachingDraft(input: { actorId: string; analyzedUserId: string; leadId: string; role: CoachingRole; draft: CoachingAnalysisDraft; permissions?: readonly Permission[] }) {
  if (!canGenerateCoaching({ actorId: input.actorId, targetUserId: input.analyzedUserId, permissions: input.permissions ?? [] })) throw new Error("Coaching drafts can only be generated for the authenticated agent or an administrator");
  const draft = coachingAnalysisDraftSchema.parse(input.draft);
  const [lead, rubrics] = await Promise.all([
    db.query.leads.findFirst({ columns: { id: true, campaign: true }, where: (table, { eq }) => eq(table.id, input.leadId) }),
    db.select().from(commercialCoachingRubrics).where(eq(commercialCoachingRubrics.active, true)),
  ]);
  if (!lead) throw new Error("Lead not found");
  const rubric = selectCoachingRubric({ rubrics: rubrics.map((row) => ({ ...row, role: row.role as CoachingRole })), role: input.role, product: null, campaign: lead.campaign });
  if (!rubric || rubric.version !== draft.rubricVersion) throw new Error("No active coaching rubric matches this analysis");
  const [created] = await db.insert(commercialCoachingAnalyses).values({
    id: crypto.randomUUID(), rubricId: rubric.id, rubricVersion: rubric.version, leadId: input.leadId, analyzedUserId: input.analyzedUserId, role: input.role,
    product: rubric.product, campaign: lead.campaign, criteria: draft.criteria, summary: draft.summary, requiresPersonalReview: draft.requiresPersonalReview, reviewReasons: draft.reviewReasons,
    createdById: input.actorId, excludedFromCompensation: true, excludedFromAutomaticAssignment: true, disciplinaryUseProhibited: true,
  }).returning({ id: commercialCoachingAnalyses.id });
  if (!created) throw new Error("Could not create coaching draft");
  return created;
}

export async function listCoachingAnalyses(input: { actorId: string; targetUserId?: string; permissions: readonly Permission[] }) {
  const canReadAll = has(input.permissions, "coaching:read");
  const targetUserId = input.targetUserId ?? (canReadAll ? undefined : input.actorId);
  if (targetUserId && !canReadCoaching({ ...input, targetUserId })) throw new Error("Coaching analysis is private");
  return db.query.commercialCoachingAnalyses.findMany({ where: targetUserId ? (table, { eq }) => eq(table.analyzedUserId, targetUserId) : undefined, with: { lead: { columns: { id: true, name: true } } }, orderBy: (table, { desc }) => desc(table.createdAt), limit: 50 });
}

export async function reviewCoachingAnalysis(input: { actorId: string; permissions: readonly Permission[]; id: string; decision: "confirmed" | "discarded"; draft?: CoachingAnalysisDraft }) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(commercialCoachingAnalyses).where(eq(commercialCoachingAnalyses.id, input.id)).for("update");
    if (!row) throw new Error("Coaching analysis not found");
    if (!canReviewCoaching({ actorId: input.actorId, targetUserId: row.analyzedUserId, permissions: input.permissions })) throw new Error("Coaching review is private");
    if (row.status !== "draft") throw new Error("Coaching analysis was already reviewed");
    const reviewed = input.draft ? coachingAnalysisDraftSchema.parse(input.draft) : null;
    await tx.update(commercialCoachingAnalyses).set({
      status: input.decision, reviewedById: input.actorId, reviewedAt: new Date(), updatedAt: new Date(),
      ...(reviewed ? { criteria: reviewed.criteria, summary: reviewed.summary, requiresPersonalReview: reviewed.requiresPersonalReview, reviewReasons: reviewed.reviewReasons } : {}),
    }).where(and(eq(commercialCoachingAnalyses.id, input.id), eq(commercialCoachingAnalyses.status, "draft")));
    return { id: input.id, status: input.decision };
  });
}

export async function listCoachingCohorts(input: { permissions: readonly Permission[] }) {
  if (!has(input.permissions, "coaching:read")) throw new Error("Coaching cohorts require coach authority");
  const rows = await db.select({ agentId: commercialCoachingAnalyses.analyzedUserId, role: commercialCoachingAnalyses.role, product: commercialCoachingAnalyses.product, campaign: commercialCoachingAnalyses.campaign, criteria: commercialCoachingAnalyses.criteria }).from(commercialCoachingAnalyses).where(eq(commercialCoachingAnalyses.status, "confirmed")).orderBy(desc(commercialCoachingAnalyses.createdAt));
  return buildCoachingCohortComparison(rows.map((row) => ({ agentId: row.agentId, role: row.role as CoachingRole, difficulty: row.product ? `product:${row.product}` : row.campaign ? `campaign:${row.campaign}` : "general", criteria: row.criteria })));
}
