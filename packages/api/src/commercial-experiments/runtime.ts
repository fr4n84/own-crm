import { and, db, eq, exists, inArray, isNull, lt, ne, sql } from "@crm-fran/db";
import { commercialExperimentAssignments, commercialExperiments, leadActivityEvents, leads, LEAD_ACTIVITY_KIND, type LeadQASession } from "@crm-fran/db/schema/index";

import type { CommercialExperimentOutcome } from "./domain";
import type { CommercialExperimentsRepository, ExperimentAssignment, ExperimentLead, ExperimentRecord } from "./service";
import { getAuthoritativeFeedbackOutcome, isAuthoritativeCallerContact } from "../lead-feedback-events";

function profile(questions: LeadQASession) { return questions.find((item) => item.questionKey === "profile" || item.questionKey === "subprofile")?.answer ?? null; }
export function mapCommercialExperimentOutcome(kind: string, description: string | null, metadata: Record<string, unknown> = {}, actorRole: string | null = null): CommercialExperimentOutcome | null {
  if (kind === LEAD_ACTIVITY_KIND.APPOINTMENT_SCHEDULED || kind === LEAD_ACTIVITY_KIND.APPOINTMENT_RESCHEDULED) return "appointment";
  const event = { kind, description, metadata, actorRole };
  if (isAuthoritativeCallerContact(event)) return "contacted";
  const authoritativeOutcome = getAuthoritativeFeedbackOutcome(event);
  if (kind === LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK && authoritativeOutcome === "Venta") return "sale";
  if (kind === LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK && ["Agenda", "Reagenda", "Seguimiento"].includes(authoritativeOutcome ?? "")) return "show";
  return null;
}

export function createCommercialExperimentsRepository(database: typeof db): CommercialExperimentsRepository {
  return {
    async transaction<T>(work: (repository: CommercialExperimentsRepository) => Promise<T>) { return database.transaction((transaction) => work(createCommercialExperimentsRepository(transaction as unknown as typeof db))); },
    async createExperiment(value) { const [row] = await database.insert(commercialExperiments).values(value as unknown as typeof commercialExperiments.$inferInsert).returning(); if (!row) throw new Error("Experiment creation returned no row"); return row as unknown as ExperimentRecord; },
    async findExperiment(id) { const row = await database.query.commercialExperiments.findFirst({ where: (table, { eq }) => eq(table.id, id) }); return row ? row as unknown as ExperimentRecord : null; },
    async lockExperiment(id) { const [row] = await database.select().from(commercialExperiments).where(eq(commercialExperiments.id, id)).for("update"); return row ? row as unknown as ExperimentRecord : null; },
    async listExperiments() { return (await database.select().from(commercialExperiments)) as unknown as ExperimentRecord[]; },
    async updateExperiment(id, patch, condition) {
      const predicates = [eq(commercialExperiments.id, id)];
      if (condition?.expectedStatus) predicates.push(eq(commercialExperiments.status, condition.expectedStatus));
      if (condition?.requireNoFinalDecision) predicates.push(isNull(commercialExperiments.finalDecision));
      const [row] = await database.update(commercialExperiments).set(patch as unknown as typeof commercialExperiments.$inferInsert).where(and(...predicates)).returning();
      return row ? row as unknown as ExperimentRecord : null;
    },
    async findEligibleLeads() { const rows = await database.select().from(leads); return rows.map((lead) => ({ id: lead.id, profile: profile(lead.questions), source: lead.source, campaign: lead.campaign, type: lead.type, callerId: lead.callerId, closerId: lead.closerId, createdAt: lead.createdAt, recommendedCallerId: null, recommendedCloserId: null } satisfies ExperimentLead)); },
    async findAssignments(experimentId) { return (await database.select().from(commercialExperimentAssignments).where(eq(commercialExperimentAssignments.experimentId, experimentId))) as unknown as ExperimentAssignment[]; },
    async findConflictingLeadIds(input) {
      if (input.leadIds.length === 0) return new Set<string>();
      const rows = await database.select({ leadId: commercialExperimentAssignments.leadId }).from(commercialExperimentAssignments).innerJoin(commercialExperiments, eq(commercialExperimentAssignments.experimentId, commercialExperiments.id)).where(and(eq(commercialExperiments.status, "active"), eq(commercialExperiments.interventionType, input.interventionType), ne(commercialExperimentAssignments.experimentId, input.experimentId), inArray(commercialExperimentAssignments.leadId, [...input.leadIds])));
      return new Set(rows.map((row) => row.leadId));
    },
    async lockLeadInterventions(input) {
      for (const leadId of [...input.leadIds].sort()) await database.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.interventionType}:${leadId}`}))`);
    },
    async insertAssignments(values) { if (values.length === 0) return { inserted: 0, existing: 0 }; const rows = await database.insert(commercialExperimentAssignments).values(values as unknown as (typeof commercialExperimentAssignments.$inferInsert)[]).onConflictDoNothing().returning({ id: commercialExperimentAssignments.id }); return { inserted: rows.length, existing: values.length - rows.length }; },
    async markTreatmentApplied(input) {
      const activeExperiment = database.select({ value: sql<number>`1` }).from(commercialExperiments).where(and(eq(commercialExperiments.id, commercialExperimentAssignments.experimentId), eq(commercialExperiments.status, "active")));
      const [row] = await database.update(commercialExperimentAssignments).set({ treatmentAppliedAt: input.at, treatmentAppliedById: input.actorId }).where(and(eq(commercialExperimentAssignments.id, input.assignmentId), eq(commercialExperimentAssignments.arm, "treatment"), isNull(commercialExperimentAssignments.treatmentAppliedAt), exists(activeExperiment))).returning();
      return row ? row as unknown as ExperimentAssignment : null;
    },
    async findOutcomeEvents(input) { if (input.leadIds.length === 0) return []; const rows = await database.select({ leadId: leadActivityEvents.leadId, kind: leadActivityEvents.kind, description: leadActivityEvents.description, metadata: leadActivityEvents.metadata, actorRole: leadActivityEvents.actorRole, occurredAt: leadActivityEvents.occurredAt }).from(leadActivityEvents).where(and(inArray(leadActivityEvents.leadId, [...input.leadIds]), lt(leadActivityEvents.occurredAt, input.before))); return rows.flatMap((row) => { const mapped = mapCommercialExperimentOutcome(row.kind, row.description, row.metadata, row.actorRole); return mapped ? [{ leadId: row.leadId, kind: mapped, occurredAt: row.occurredAt }] : []; }); },
  };
}

export const commercialExperimentsRepository = createCommercialExperimentsRepository(db);
