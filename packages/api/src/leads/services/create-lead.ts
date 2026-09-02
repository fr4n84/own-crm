import { TRPCError } from "@trpc/server";

import { db } from "@crm-fran/db";
import {
  leads,
  LEAD_ACTIVITY_KIND,
  MARKETING_ATTRIBUTION_MATCH_KIND,
  type LeadType,
} from "@crm-fran/db/schema/index";
import { appendLeadActivity } from "./lead-activity";
import { resolveLeadMarketingAttribution } from "../../marketing-attribution/service";

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

export async function createLead(input: CreateLeadInput) {
  return db.transaction(async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({ id: crypto.randomUUID(), ...input })
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

    return resolvedLead;
  });
}
