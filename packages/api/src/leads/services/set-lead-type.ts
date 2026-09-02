import { TRPCError } from "@trpc/server";

import { db, eq } from "@crm-fran/db";
import {
  leads,
  LEAD_ACTIVITY_KIND,
  type LeadType,
} from "@crm-fran/db/schema/index";
import { appendLeadActivity } from "./lead-activity";

export async function setLeadType({
  id,
  type,
  actorId,
}: {
  id: string;
  type: LeadType;
  actorId: string;
}) {
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(leads).where(eq(leads.id, id));
    const [lead] = await tx
      .update(leads)
      .set({ type })
      .where(eq(leads.id, id))
      .returning();

    if (!lead) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
    }

    if (previous?.type !== type) {
      await appendLeadActivity(tx, {
        leadId: id,
        actorId,
        kind: LEAD_ACTIVITY_KIND.LEAD_TYPE_CHANGED,
        title: "Tipo de lead actualizado",
        description: `${previous?.type ?? "Sin tipo"} → ${type}`,
        metadata: { previousType: previous?.type, type },
        dedupeKey: `lead_type_changed:${id}:${lead.updatedAt.toISOString()}`,
      });
    }

    return lead;
  });
}
