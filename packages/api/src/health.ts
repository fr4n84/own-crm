import { db, sql } from "@crm-fran/db";

export async function checkDatabaseReadiness() {
  await db.execute(sql`select 1 as ready`);
}
