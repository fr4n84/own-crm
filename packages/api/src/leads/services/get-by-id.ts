import { eq} from "@crm-fran/db";
import { leads } from "@crm-fran/db/schema/index";
import { selectLeadWithUsers } from "../queries/index";

export async function getById({ id }: { id: string }) {
  return await selectLeadWithUsers(eq(leads.id, id)).limit(1);
}