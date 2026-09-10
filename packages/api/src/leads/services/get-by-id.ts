import { eq } from "@crm-fran/db";
import { leads } from "@crm-fran/db/schema/index";
import { selectLeadWithUsers } from "../queries/index";

export async function getById({ id }: { id: string }) {
  const result = await selectLeadWithUsers(eq(leads.id, id)).limit(1);
  const lead = result[0];
  if (!lead?.mergedIntoLeadId) return result;
  return selectLeadWithUsers(eq(leads.id, lead.mergedIntoLeadId)).limit(1);
}
