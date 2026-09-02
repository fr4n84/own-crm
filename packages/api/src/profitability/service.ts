import { TRPCError } from "@trpc/server";

import { and, db, desc, eq, gte, ilike, inArray, lte, or, sql } from "@crm-fran/db";
import {
  campaignSpendPeriods,
  leadFinancialEvents,
  leadActivityEvents,
  leads,
  LEAD_ACTIVITY_KIND,
  user,
  type LeadActivityMetadata,
  type LeadQASession,
  type LeadFinancialEventKind,
} from "@crm-fran/db/schema/index";

import {
  buildProfitabilityAnalysis,
  type ProfitabilityLead,
} from "./analysis";
import { buildFinancialTruthProjection } from "./financial-truth";
import {
  classifyReversalInsertConflict,
  isSameRecordRequest,
  isSameReversalRequest,
  reversalProblem,
} from "./financial-event-rules";
import { confirmedProfileValue, parseConfirmedFacts } from "../commercial-evidence/facts";
import { getAuthoritativeFeedbackOutcome, isAuthoritativeCallerContact } from "../lead-feedback-events";

type Activity = {
  leadId: string;
  kind: string;
  description: string | null;
  actorRole: string | null;
  metadata: LeadActivityMetadata;
  occurredAt: Date;
};

const profileFrom = (questions: LeadQASession) => confirmedProfileValue(parseConfirmedFacts(questions));

const metadataString = (metadata: LeadActivityMetadata, key: string) => {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
};

function latestAssignment(
  events: readonly Activity[],
  kind: string,
  fallbackId: string | null,
) {
  const event = events
    .filter((item) => item.kind === kind)
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0];
  return event ? metadataString(event.metadata, "userId") ?? fallbackId : fallbackId;
}

function outcomeFlags(events: readonly Activity[]) {
  return {
    contacted: events.some(isAuthoritativeCallerContact),
    appointment: events.some(
      (event) =>
        event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_SCHEDULED ||
        event.kind === LEAD_ACTIVITY_KIND.APPOINTMENT_RESCHEDULED,
    ),
    show: events.some(
      (event) =>
        event.kind === LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK &&
        ["Agenda", "Reagenda", "Seguimiento"].includes(
          getAuthoritativeFeedbackOutcome(event) ?? "",
        ),
    ),
    sale: events.some(
      (event) =>
        event.kind === LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK &&
        getAuthoritativeFeedbackOutcome(event) === "Venta",
    ),
  };
}

export const profitabilityService = {
  async searchAttributionLeads(input: { query: string; limit: number }) {
    const query = input.query.trim();
    const condition = query
      ? or(
          ilike(leads.name, `%${query}%`),
          ilike(leads.email, `%${query}%`),
        )
      : undefined;
    return db
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        source: leads.source,
        campaign: leads.campaign,
        ad: leads.ad,
        creative: leads.creative,
        acquisitionAngle: leads.acquisitionAngle,
      })
      .from(leads)
      .where(condition)
      .orderBy(desc(leads.createdAt))
      .limit(input.limit);
  },

  async overview(input: { from: Date; to: Date; currency?: string }) {
    const currency = input.currency ?? "EUR";
    const allSpendPeriods = await db
      .select()
      .from(campaignSpendPeriods)
      .where(
        and(
          gte(campaignSpendPeriods.periodStart, input.from),
          lte(campaignSpendPeriods.periodEnd, input.to),
        ),
      );
    const availableCurrencies = [...new Set(allSpendPeriods.map((period) => period.currency))].sort();
    if (availableCurrencies.length === 0) availableCurrencies.push("EUR");
    const spendPeriods = allSpendPeriods.filter(
      (period) => period.currency === currency,
    );
    const leadRows = await db
      .select({
        id: leads.id,
        profileQuestions: leads.questions,
        source: leads.source,
        campaign: leads.campaign,
        ad: leads.ad,
        creative: leads.creative,
        acquisitionAngle: leads.acquisitionAngle,
        createdAt: leads.createdAt,
        callerId: leads.callerId,
        closerId: leads.closerId,
      })
      .from(leads)
      .where(and(gte(leads.createdAt, input.from), lte(leads.createdAt, input.to)));
    const leadIds = leadRows.map((lead) => lead.id);
    const activities =
      leadIds.length === 0
        ? []
        : await db
            .select({
              leadId: leadActivityEvents.leadId,
              kind: leadActivityEvents.kind,
              description: leadActivityEvents.description,
              actorRole: leadActivityEvents.actorRole,
              metadata: leadActivityEvents.metadata,
              occurredAt: leadActivityEvents.occurredAt,
            })
            .from(leadActivityEvents)
            .where(
              and(
                inArray(leadActivityEvents.leadId, leadIds),
                lte(leadActivityEvents.occurredAt, input.to),
              ),
            );
    const userIds = new Set<string>();
    for (const lead of leadRows) {
      if (lead.callerId) userIds.add(lead.callerId);
      if (lead.closerId) userIds.add(lead.closerId);
    }
    for (const event of activities) {
      const assignmentId = metadataString(event.metadata, "userId");
      if (assignmentId) userIds.add(assignmentId);
    }
    const people =
      userIds.size === 0
        ? []
        : await db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(inArray(user.id, [...userIds]));
    const names = new Map(people.map((person) => [person.id, person.name]));
    const eventsByLead = new Map<string, Activity[]>();
    for (const event of activities) {
      const current = eventsByLead.get(event.leadId) ?? [];
      current.push(event);
      eventsByLead.set(event.leadId, current);
    }
    const analysisLeads: ProfitabilityLead[] = leadRows.map((lead) => {
      const events = eventsByLead.get(lead.id) ?? [];
      const firstSaleAt = events
        .filter(
          (event) =>
            event.kind === LEAD_ACTIVITY_KIND.CLOSER_FEEDBACK &&
            getAuthoritativeFeedbackOutcome(event) === "Venta",
        )
        .sort(
          (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
        )[0]?.occurredAt;
      const assignmentEvents = firstSaleAt
        ? events.filter((event) => event.occurredAt <= firstSaleAt)
        : events;
      const callerId = latestAssignment(
        assignmentEvents,
        LEAD_ACTIVITY_KIND.CALLER_ASSIGNED,
        lead.callerId,
      );
      const closerId = latestAssignment(
        assignmentEvents,
        LEAD_ACTIVITY_KIND.CLOSER_ASSIGNED,
        lead.closerId,
      );
      return {
        id: lead.id,
        profile: profileFrom(lead.profileQuestions),
        source: lead.source,
        campaign: lead.campaign,
        ad: lead.ad,
        creative: lead.creative,
        acquisitionAngle: lead.acquisitionAngle,
        createdAt: lead.createdAt,
        callerId,
        callerName: callerId ? names.get(callerId) ?? callerId : null,
        closerId,
        closerName: closerId ? names.get(closerId) ?? closerId : null,
        ...outcomeFlags(events),
      };
    });
    const campaignOptions = [
      ...new Map(
        leadRows
          .filter(
            (lead): lead is typeof lead & { source: string; campaign: string } =>
              Boolean(lead.source && lead.campaign),
          )
          .map((lead) => [
            `${lead.source}\u0000${lead.campaign}`,
            { source: lead.source, campaign: lead.campaign },
          ]),
      ).values(),
    ].sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        left.campaign.localeCompare(right.campaign),
    );

    return {
      ...buildProfitabilityAnalysis({
        from: input.from,
        to: input.to,
        currency,
        spendPeriods,
        leads: analysisLeads,
      }),
      spendPeriods,
      availableCurrencies,
      campaignOptions,
    };
  },

  async saveSpend(input: {
    id?: string;
    source: string;
    campaign: string;
    periodStart: Date;
    periodEnd: Date;
    spendCents: number;
    referenceSaleValueCents: number;
    currency?: string;
    actorId: string;
  }) {
    return db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.source}), hashtext(${input.campaign}))`,
      );
      const overlaps = await transaction
        .select({ id: campaignSpendPeriods.id })
        .from(campaignSpendPeriods)
        .where(
          and(
            eq(campaignSpendPeriods.source, input.source),
            eq(campaignSpendPeriods.campaign, input.campaign),
            lte(campaignSpendPeriods.periodStart, input.periodEnd),
            gte(campaignSpendPeriods.periodEnd, input.periodStart),
          ),
        );
      if (overlaps.some((period) => period.id !== input.id)) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Ya existe un gasto solapado para esta fuente y campaña.",
        });
      }
      const values = {
        source: input.source,
        campaign: input.campaign,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        spendCents: input.spendCents,
        referenceSaleValueCents: input.referenceSaleValueCents,
        currency: input.currency ?? "EUR",
        updatedAt: new Date(),
      };
      if (input.id) {
        const [updated] = await transaction
          .update(campaignSpendPeriods)
          .set(values)
          .where(eq(campaignSpendPeriods.id, input.id))
          .returning();
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Gasto publicitario no encontrado.",
          });
        }
        return updated;
      }
      const [created] = await transaction
        .insert(campaignSpendPeriods)
        .values({
          id: crypto.randomUUID(),
          ...values,
          createdById: input.actorId,
        })
        .returning();
      return created!;
    });
  },

  async deleteSpend(id: string) {
    const deleted = await db
      .delete(campaignSpendPeriods)
      .where(eq(campaignSpendPeriods.id, id))
      .returning({ id: campaignSpendPeriods.id });
    return { deleted: deleted.length > 0 };
  },

  async listFinancialLedger(leadId: string) {
    const events = await db
      .select()
      .from(leadFinancialEvents)
      .where(eq(leadFinancialEvents.leadId, leadId))
      .orderBy(desc(leadFinancialEvents.occurredAt), desc(leadFinancialEvents.createdAt));
    return {
      events,
      projectionByCurrency: buildFinancialTruthProjection(events),
      source: "manual_financial_ledger" as const,
      estimatedProfitabilityIsSeparate: true as const,
    };
  },

  async recordFinancialEvent(input: {
    leadId: string;
    kind: Exclude<LeadFinancialEventKind, "reversal">;
    amountCents: number;
    currency: string;
    occurredAt: Date;
    actorId: string;
    idempotencyKey: string;
    note?: string;
    externalReference?: string;
  }) {
    return db.transaction(async (transaction) => {
      const [lead] = await transaction
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.id, input.leadId));
      if (!lead) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead no encontrado." });
      }
      const [created] = await transaction
        .insert(leadFinancialEvents)
        .values({
          id: crypto.randomUUID(),
          leadId: input.leadId,
          kind: input.kind,
          amountCents: input.amountCents,
          currency: input.currency,
          occurredAt: input.occurredAt,
          createdById: input.actorId,
          idempotencyKey: input.idempotencyKey,
          note: input.note,
          externalReference: input.externalReference,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return created;
      const [existing] = await transaction
        .select()
        .from(leadFinancialEvents)
        .where(
          and(
            eq(leadFinancialEvents.createdById, input.actorId),
            eq(leadFinancialEvents.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (!existing || !isSameRecordRequest(existing, input)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "La clave de idempotencia ya se utilizó para otra operación.",
        });
      }
      return existing;
    });
  },

  async reverseFinancialEvent(input: {
    leadId: string;
    eventId: string;
    occurredAt: Date;
    actorId: string;
    idempotencyKey: string;
    note?: string;
  }) {
    return db.transaction(async (transaction) => {
      const [retry] = await transaction
        .select()
        .from(leadFinancialEvents)
        .where(
          and(
            eq(leadFinancialEvents.createdById, input.actorId),
            eq(leadFinancialEvents.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (retry) {
        if (!isSameReversalRequest(retry, input)) {
          throw new TRPCError({ code: "CONFLICT", message: "La clave de idempotencia ya se utilizó para otra operación." });
        }
        return retry;
      }
      await transaction.execute(
        sql`select id from lead_financial_events where id = ${input.eventId} for update`,
      );
      const [original] = await transaction
        .select()
        .from(leadFinancialEvents)
        .where(eq(leadFinancialEvents.id, input.eventId));
      const problem = reversalProblem(original, input.leadId);
      if (problem === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Movimiento financiero no encontrado para este lead." });
      }
      if (problem === "reversal_of_reversal") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede revertir una reversión." });
      }
      if (!original) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo validar el movimiento financiero." });
      }
      const [concurrentRetry] = await transaction
        .select()
        .from(leadFinancialEvents)
        .where(
          and(
            eq(leadFinancialEvents.createdById, input.actorId),
            eq(leadFinancialEvents.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (concurrentRetry) {
        if (!isSameReversalRequest(concurrentRetry, input)) {
          throw new TRPCError({ code: "CONFLICT", message: "La clave de idempotencia ya se utilizó para otra operación." });
        }
        return concurrentRetry;
      }
      const [existingReversal] = await transaction
        .select({ id: leadFinancialEvents.id })
        .from(leadFinancialEvents)
        .where(eq(leadFinancialEvents.reversalOfId, original.id));
      if (existingReversal) {
        throw new TRPCError({ code: "CONFLICT", message: "El movimiento ya fue revertido." });
      }
      const [created] = await transaction
        .insert(leadFinancialEvents)
        .values({
          id: crypto.randomUUID(),
          leadId: original.leadId,
          kind: "reversal",
          amountCents: original.amountCents,
          currency: original.currency,
          occurredAt: input.occurredAt,
          createdById: input.actorId,
          idempotencyKey: input.idempotencyKey,
          note: input.note,
          reversalOfId: original.id,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return created;

      const [idempotencyEvent] = await transaction
        .select()
        .from(leadFinancialEvents)
        .where(
          and(
            eq(leadFinancialEvents.createdById, input.actorId),
            eq(leadFinancialEvents.idempotencyKey, input.idempotencyKey),
          ),
        );
      const [sourceReversal] = await transaction
        .select({ id: leadFinancialEvents.id })
        .from(leadFinancialEvents)
        .where(eq(leadFinancialEvents.reversalOfId, original.id));
      const conflict = classifyReversalInsertConflict(
        {
          idempotencyEvent,
          sourceReversalExists: Boolean(sourceReversal),
        },
        input,
      );
      if (conflict === "retry") return idempotencyEvent!;
      if (conflict === "already_reversed") {
        throw new TRPCError({ code: "CONFLICT", message: "El movimiento ya fue revertido." });
      }
      throw new TRPCError({
        code: "CONFLICT",
        message:
          conflict === "idempotency_conflict"
            ? "La clave de idempotencia ya se utilizó para otra operación."
            : "No se pudo registrar la reversión por un conflicto concurrente.",
      });
    });
  },
};
