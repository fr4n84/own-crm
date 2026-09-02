import { TRPCError } from "@trpc/server";

import { db, eq, sql } from "@crm-fran/db";
import {
  leads,
  LEAD_ACTIVITY_KIND,
} from "@crm-fran/db/schema/index";

import { appendLeadActivity } from "./lead-activity";

export type AcquisitionAttribution = {
  source: string | null;
  campaign: string | null;
  ad: string | null;
  creative: string | null;
  acquisitionAngle: string | null;
};

export function normalizeAcquisitionAttribution(
  input: AcquisitionAttribution,
): AcquisitionAttribution {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value?.trim() || null]),
  ) as AcquisitionAttribution;
}

export function attributionChanges(
  before: AcquisitionAttribution,
  after: AcquisitionAttribution,
) {
  const changed = Object.keys(after).some(
    (key) => before[key as keyof AcquisitionAttribution] !== after[key as keyof AcquisitionAttribution],
  );
  return changed ? { before, after } : null;
}

function attributionLeadDto(lead: {
  id: string;
  name: string;
  email: string | null;
} & AcquisitionAttribution) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    source: lead.source,
    campaign: lead.campaign,
    ad: lead.ad,
    creative: lead.creative,
    acquisitionAngle: lead.acquisitionAngle,
  };
}

export async function updateAcquisitionAttribution(input: {
  leadId: string;
  actorId: string;
  attribution: AcquisitionAttribution;
}) {
  const attribution = normalizeAcquisitionAttribution(input.attribution);
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from leads where id = ${input.leadId} for update`,
    );
    const [current] = await transaction
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
      .where(eq(leads.id, input.leadId));
    if (!current) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead no encontrado." });
    }

    const before: AcquisitionAttribution = {
      source: current.source,
      campaign: current.campaign,
      ad: current.ad,
      creative: current.creative,
      acquisitionAngle: current.acquisitionAngle,
    };
    const change = attributionChanges(before, attribution);
    if (!change) {
      return { lead: attributionLeadDto(current), changed: false as const };
    }

    const [updated] = await transaction
      .update(leads)
      .set(attribution)
      .where(eq(leads.id, input.leadId))
      .returning();
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead no encontrado." });
    }

    await appendLeadActivity(transaction, {
      leadId: input.leadId,
      actorId: input.actorId,
      actorRole: "admin",
      kind: LEAD_ACTIVITY_KIND.LEAD_ATTRIBUTION_UPDATED,
      title: "Atribución de captación actualizada",
      description: "La atribución actual del lead se actualizó manualmente.",
      metadata: change,
      dedupeKey: `lead_attribution_updated:${input.leadId}:${crypto.randomUUID()}`,
    });
    return { lead: attributionLeadDto(updated), changed: true as const };
  });
}
