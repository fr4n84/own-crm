import { db, eq } from "@crm-fran/db";
import { leads } from "@crm-fran/db/schema/index";

export async function deleteLead(id: string) {
  await db.delete(leads).where(eq(leads.id, id));
  return { success: true as const, id };
}
