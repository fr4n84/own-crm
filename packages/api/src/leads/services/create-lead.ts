import { TRPCError } from "@trpc/server";

import { db, eq } from "@crm-fran/db";
import {
  leads,
  LEAD_ACTIVITY_KIND,
  MARKETING_ATTRIBUTION_MATCH_KIND,
  type LeadType,
} from "@crm-fran/db/schema/index";
import { appendLeadActivity } from "./lead-activity";
import { resolveLeadMarketingAttribution } from "../../marketing-attribution/service";
import { configuredLeadPhoneCountry, normalizeLeadEmail, normalizeLeadPhone } from "@crm-fran/db/lead-identity";
import { createDuplicateCasesForLead } from "../duplicates/service";

export type CreateLeadInput = {
  name: string;
  email: string;
  phone: string;
  source?: string;
  campaign?: string;
  ad?: string;
  creative?: string;
  acquisitionAngle?: string;
  utmContent?: string;
  type: LeadType;
};

export function leadCreatedAttributionMetadata(
  lead: {
    source?: string | null;
    campaign?: string | null;
    ad?: string | null;
    creative?: string | null;
    acquisitionAngle?: string | null;
    utmContent?: string | null;
  },
) {
  return {
    source: lead.source ?? null,
    campaign: lead.campaign ?? null,
    ad: lead.ad ?? null,
    creative: lead.creative ?? null,
    acquisitionAngle: lead.acquisitionAngle ?? null,
    utmContent: lead.utmContent ?? null,
  };
}

export async function createLead(input: CreateLeadInput, actorId: string) {
  return db.transaction(async (tx) => {
    const email = normalizeLeadEmail(input.email);
    const phone = normalizeLeadPhone(input.phone, configuredLeadPhoneCountry());
    const [lead] = await tx
      .insert(leads)
      .values({
        id: crypto.randomUUID(),
        ...input,
        email: email.original,
        normalizedEmail: email.normalized,
        phone: phone.original,
        normalizedPhone: phone.normalized,
      })
      .returning();

    if (!lead) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create lead",
      });
    }

    const attribution = await resolveLeadMarketingAttribution(
      tx,
      {
        id: lead.id,
        source: lead.source,
        utmContent: lead.utmContent,
        createdAt: lead.createdAt,
      },
      { matchKind: MARKETING_ATTRIBUTION_MATCH_KIND.AUTOMATIC },
    );
    const resolvedLead = attribution ? { ...lead, ...attribution } : lead;

    await appendLeadActivity(tx, {
      leadId: lead.id,
      kind: LEAD_ACTIVITY_KIND.LEAD_CREATED,
      title: "Lead creado",
      description: `Lead ${lead.name} incorporado al CRM`,
	      metadata: {
	        type: lead.type,
	        ...leadCreatedAttributionMetadata(resolvedLead),
	      },
      dedupeKey: `lead_created:${lead.id}`,
      occurredAt: lead.createdAt,
    });

    const duplicateResolution = await createDuplicateCasesForLead(tx, lead, actorId);
    if (duplicateResolution.autoMerged) {
      const [canonical] = await tx
        .select()
        .from(leads)
        .where(eq(leads.id, duplicateResolution.autoMerged.canonicalLeadId))
        .limit(1);
      if (!canonical) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo recuperar el lead principal tras la fusión automática",
        });
      }
      return canonical;
    }

    return resolvedLead;
  });
}
