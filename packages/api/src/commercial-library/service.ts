import { TRPCError } from "@trpc/server";
import { db, desc, eq, sql } from "@crm-fran/db";
import { commercialExperiments, commercialLibraryVersions, leads, type CommercialLibraryEvidence, type CommercialLibraryTargeting } from "@crm-fran/db/schema/index";
import { MOTIVATION_ANGLES, OBJECTION_TYPES } from "../call-feedback";
import { commercialLibraryAdvisoryLockKey, experimentEvidenceLabel, latestLibraryVersions, latestVisibleLibraryVersions, normalizeCommercialLibraryEvidenceLabel, planManualLibraryVersionAppend } from "./domain";

export type LibraryDraftInput = { lineageKey: string; type: string; title: string; content: string; targeting: CommercialLibraryTargeting; evidence: CommercialLibraryEvidence; originExperimentId?: string | null };

async function evidenceWithLabel(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], evidence: CommercialLibraryEvidence, originExperimentId?: string | null) {
  if (!originExperimentId) return { ...evidence, evidenceLabel: "observational" as const };
  const [experiment] = await tx.select({ status: commercialExperiments.status, finalDecision: commercialExperiments.finalDecision, finalDecisionById: commercialExperiments.finalDecisionById }).from(commercialExperiments).where(eq(commercialExperiments.id, originExperimentId));
  if (!experiment) throw new TRPCError({ code: "BAD_REQUEST", message: "Origin experiment not found" });
  return { ...evidence, evidenceLabel: experimentEvidenceLabel({ status: experiment.status, finalDecision: experiment.finalDecision, approvedById: experiment.finalDecisionById }) };
}

export async function createLibraryDraft(input: LibraryDraftInput & { actorId: string }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${commercialLibraryAdvisoryLockKey(input.lineageKey)}))`);
    const existing = await tx.select({ id: commercialLibraryVersions.id, version: commercialLibraryVersions.version, status: commercialLibraryVersions.status, type: commercialLibraryVersions.type }).from(commercialLibraryVersions).where(eq(commercialLibraryVersions.lineageKey, input.lineageKey));
    let next;
    try { next = planManualLibraryVersionAppend(existing, "create_draft", input.type); }
    catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Invalid transition" }); }
    const evidence = await evidenceWithLabel(tx, input.evidence, input.originExperimentId);
    const [created] = await tx.insert(commercialLibraryVersions).values({ id: crypto.randomUUID(), ...input, ...next, evidence, actorId: input.actorId }).returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Library draft was not created" });
    return created;
  });
}

async function transitionLibraryVersion(input: { lineageKey: string; actorId: string; action: "publish" | "archive" }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${commercialLibraryAdvisoryLockKey(input.lineageKey)}))`);
    const rows = await tx.select().from(commercialLibraryVersions).where(eq(commercialLibraryVersions.lineageKey, input.lineageKey)).orderBy(desc(commercialLibraryVersions.version));
    const latest = rows[0];
    if (!latest) throw new TRPCError({ code: "NOT_FOUND", message: "Library lineage not found" });
    let next;
    try { next = planManualLibraryVersionAppend(rows, input.action); }
    catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Invalid transition" }); }
    const approved = next.status === "published";
    const [created] = await tx.insert(commercialLibraryVersions).values({
      id: crypto.randomUUID(), lineageKey: latest.lineageKey, ...next, title: latest.title, content: latest.content,
      targeting: latest.targeting, evidence: latest.evidence, originExperimentId: latest.originExperimentId,
      actorId: input.actorId, approvedById: approved ? input.actorId : latest.approvedById,
      approvedAt: approved ? new Date() : latest.approvedAt,
    }).returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Library version was not created" });
    return created;
  });
}

export const publishLibraryVersion = (input: { lineageKey: string; actorId: string }) => transitionLibraryVersion({ ...input, action: "publish" });
export const archiveLibraryVersion = (input: { lineageKey: string; actorId: string }) => transitionLibraryVersion({ ...input, action: "archive" });

function arrayAnswer(questions: readonly { questionKey: string; answer: string }[], key: string, allowed: Set<string>) {
  const answer = questions.find((question) => question.questionKey === key)?.answer;
  if (!answer) return undefined;
  try { const value: unknown = JSON.parse(answer); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && allowed.has(item)) : undefined; } catch { return undefined; }
}

async function resolveTargeting(input: { admin: boolean; actorId: string; leadId?: string; adminTargeting?: CommercialLibraryTargeting }) {
  if (input.adminTargeting && !input.admin) throw new TRPCError({ code: "FORBIDDEN", message: "Only admins may filter library targeting" });
  if (input.adminTargeting) return input.adminTargeting;
  if (!input.leadId) return undefined;
  const [lead] = await db.select({ id: leads.id, callerId: leads.callerId, closerId: leads.closerId, source: leads.source, campaign: leads.campaign, ad: leads.ad, creative: leads.creative, acquisitionAngle: leads.acquisitionAngle, questions: leads.questions }).from(leads).where(eq(leads.id, input.leadId));
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
  if (!input.admin && lead.callerId !== input.actorId && lead.closerId !== input.actorId) throw new TRPCError({ code: "FORBIDDEN", message: "Lead is not assigned to this user" });
  const questions = lead.questions ?? [];
  return {
    profile: questions.find((question) => question.questionKey === "primaryProfile")?.answer ?? null,
    objections: arrayAnswer(questions, "objectionTypes", new Set(OBJECTION_TYPES.map((item) => item.value))),
    motivations: arrayAnswer(questions, "motivationAngles", new Set(MOTIVATION_ANGLES.map((item) => item.value))),
    source: lead.source, campaign: lead.campaign, ad: lead.ad, creative: lead.creative, acquisitionAngle: lead.acquisitionAngle,
  } satisfies CommercialLibraryTargeting;
}

export async function listLibraryVersions(input: { admin: boolean; actorId: string; leadId?: string; adminTargeting?: CommercialLibraryTargeting }) {
  const targeting = await resolveTargeting(input);
  const rows = await db.select().from(commercialLibraryVersions).orderBy(desc(commercialLibraryVersions.version));
  const applies = (target: CommercialLibraryTargeting) => {
    const current = targeting ?? {};
    return (["profile", "source", "campaign", "ad", "creative", "acquisitionAngle"] as const).every((key) => target[key] == null || target[key] === current[key]) &&
      (!target.objections?.length || target.objections.some((value) => current.objections?.includes(value))) &&
      (!target.motivations?.length || target.motivations.some((value) => current.motivations?.includes(value)));
  };
  const visible = input.admin ? latestLibraryVersions(rows) : latestVisibleLibraryVersions(rows).filter((row) => applies(row.targeting));
  return visible.map((row) => {
    const evidence = { ...row.evidence, evidenceLabel: normalizeCommercialLibraryEvidenceLabel(row.evidence.evidenceLabel) };
    return { id: row.id, lineageKey: row.lineageKey, version: row.version, status: row.status, type: row.type, title: row.title, content: row.content, targeting: row.targeting, evidence: input.admin ? evidence : { evidenceLabel: evidence.evidenceLabel, sampleSize: evidence.sampleSize }, approvedAt: row.approvedAt };
  });
}
