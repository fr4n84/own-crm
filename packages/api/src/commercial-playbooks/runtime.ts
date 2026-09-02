import { and, db, eq, lte, sql } from "@crm-fran/db";
import {
  commercialExperimentAssignments,
  commercialExperiments,
  commercialLibraryVersions,
  commercialPlaybookProposalVersions,
  leadActivityEvents,
  LEAD_ACTIVITY_KIND,
} from "@crm-fran/db/schema/index";

import { mapCommercialExperimentOutcome } from "../commercial-experiments/runtime";
import { commercialLibraryAdvisoryLockKey } from "../commercial-library/domain";
import { isAuthoritativeCallerContact } from "../lead-feedback-events";
import type { PlaybookEvidenceFacts } from "./domain";
import type {
  CommercialLibraryVersionRecord,
  CommercialPlaybookProposalRecord,
  CommercialPlaybooksRepository,
} from "./service";

function createRepository(database: typeof db): CommercialPlaybooksRepository {
  return {
    async transaction<T>(work: (repository: CommercialPlaybooksRepository) => Promise<T>) {
      return database.transaction((transaction) => work(createRepository(transaction as unknown as typeof db)));
    },
    async loadEvidenceFacts(asOf) {
      const [activities, libraries, experiments, assignments] = await Promise.all([
        database.select({ id: leadActivityEvents.id, leadId: leadActivityEvents.leadId, kind: leadActivityEvents.kind, description: leadActivityEvents.description, actorRole: leadActivityEvents.actorRole, occurredAt: leadActivityEvents.occurredAt, metadata: leadActivityEvents.metadata })
          .from(leadActivityEvents).where(lte(leadActivityEvents.occurredAt, asOf)),
        database.select().from(commercialLibraryVersions).where(lte(commercialLibraryVersions.createdAt, asOf)),
        database.select().from(commercialExperiments).where(and(eq(commercialExperiments.status, "completed"), lte(commercialExperiments.endedAt, asOf))),
        database.select().from(commercialExperimentAssignments).where(lte(commercialExperimentAssignments.enrolledAt, asOf)),
      ]);
      const assignmentEventsByLead = Map.groupBy(
        activities
          .filter((event) => event.kind === LEAD_ACTIVITY_KIND.CALLER_ASSIGNED)
          .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id)),
        (event) => event.leadId,
      );
      const feedbackEvents = activities.filter(isAuthoritativeCallerContact).map((event) => {
        const leadAssignments = assignmentEventsByLead.get(event.leadId) ?? [];
        const assignmentIndex = leadAssignments.findLastIndex((assignment) => assignment.occurredAt <= event.occurredAt);
        const assignment = assignmentIndex >= 0 ? leadAssignments[assignmentIndex] : undefined;
        return {
          id: event.id,
          leadId: event.leadId,
          assignmentEpoch: assignment?.id ?? null,
          assignmentEndedAt: assignmentIndex >= 0 ? leadAssignments[assignmentIndex + 1]?.occurredAt ?? null : null,
          occurredAt: event.occurredAt,
          metadata: event.metadata ?? {},
        };
      });
      const outcomeEvents = activities.flatMap((event) => {
        const kind = mapCommercialExperimentOutcome(event.kind, event.description, event.metadata, event.actorRole);
        return kind ? [{ id: event.id, leadId: event.leadId, kind, occurredAt: event.occurredAt }] : [];
      });
      const assignmentsByExperiment = new Map<string, typeof assignments>();
      for (const assignment of assignments) {
        const rows = assignmentsByExperiment.get(assignment.experimentId) ?? [];
        rows.push(assignment); assignmentsByExperiment.set(assignment.experimentId, rows);
      }
      return {
        asOf,
        feedbackEvents,
        outcomeEvents,
        libraryVersions: libraries as unknown as PlaybookEvidenceFacts["libraryVersions"],
        experiments: experiments.map((experiment) => ({
          id: experiment.id, status: experiment.status, finalDecision: experiment.finalDecision,
          finalDecisionById: experiment.finalDecisionById, finalDecisionAt: experiment.finalDecisionAt,
          primaryMetric: experiment.primaryMetric, maturationDays: experiment.maturationDays,
          minimumSamplePerArm: experiment.minimumSamplePerArm, guardrailTolerancePp: experiment.guardrailTolerancePp,
          endedAt: experiment.endedAt, treatmentConfig: experiment.treatmentConfig,
          assignments: (assignmentsByExperiment.get(experiment.id) ?? []).map((assignment) => ({
            id: assignment.id, leadId: assignment.leadId, arm: assignment.arm,
            enrolledAt: assignment.enrolledAt, treatmentAppliedAt: assignment.treatmentAppliedAt,
          })),
          outcomes: outcomeEvents,
        })),
      } satisfies PlaybookEvidenceFacts;
    },
    async listProposalVersions() {
      return await database.select().from(commercialPlaybookProposalVersions) as unknown as CommercialPlaybookProposalRecord[];
    },
    async listLibraryVersions() {
      return await database.select().from(commercialLibraryVersions) as unknown as CommercialLibraryVersionRecord[];
    },
    async findProposalVersions(lineageKey) {
      return await database.select().from(commercialPlaybookProposalVersions).where(eq(commercialPlaybookProposalVersions.lineageKey, lineageKey)) as unknown as CommercialPlaybookProposalRecord[];
    },
    async lockProposalLineage(lineageKey) {
      await database.execute(sql`select pg_advisory_xact_lock(hashtext(${`playbook-proposal:${lineageKey}`}))`);
    },
    async insertProposalVersion(value) {
      const [created] = await database.insert(commercialPlaybookProposalVersions).values(value).returning();
      if (!created) throw new Error("Playbook proposal insert returned no row");
      return created as unknown as CommercialPlaybookProposalRecord;
    },
    async findLibraryVersions(lineageKey) {
      return await database.select().from(commercialLibraryVersions).where(eq(commercialLibraryVersions.lineageKey, lineageKey)) as unknown as CommercialLibraryVersionRecord[];
    },
    async findLibraryVersion(id) {
      const [row] = await database.select().from(commercialLibraryVersions).where(eq(commercialLibraryVersions.id, id));
      return row ? row as unknown as CommercialLibraryVersionRecord : null;
    },
    async lockLibraryLineage(lineageKey) {
      await database.execute(sql`select pg_advisory_xact_lock(hashtext(${commercialLibraryAdvisoryLockKey(lineageKey)}))`);
    },
    async insertLibraryVersion(value) {
      const [created] = await database.insert(commercialLibraryVersions).values(value).returning();
      if (!created) throw new Error("Commercial library insert returned no row");
      return created as unknown as CommercialLibraryVersionRecord;
    },
  };
}

export const commercialPlaybooksRepository = createRepository(db);
