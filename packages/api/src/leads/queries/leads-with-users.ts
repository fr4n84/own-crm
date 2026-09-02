import type { SQL } from "@crm-fran/db";
import { alias, eq, db} from "@crm-fran/db";
import { leads, user } from "@crm-fran/db/schema/index";

const caller = alias(user, "caller");
const closer = alias(user, "closer");

export const leadWithUsersSelect = {
  id: leads.id,
  name: leads.name,
  email: leads.email,
  phone: leads.phone,
  type: leads.type,
  state: leads.state,
  questions: leads.questions,
  response: leads.response,
  feedback: leads.feedback,
  poolStatus: leads.poolStatus,
  noContactImpactCount: leads.noContactImpactCount,
  callerId: leads.callerId,
  closerId: leads.closerId,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
  caller: { id: caller.id, name: caller.name, email: caller.email },
  closer: { id: closer.id, name: closer.name, email: closer.email },
};

export function selectLeadWithUsers(where?: SQL) {
  const caller = alias(user, "caller");
  const closer = alias(user, "closer");

  const query = db
    .select(leadWithUsersSelect)
    .from(leads)
    .leftJoin(caller, eq(caller.id, leads.callerId))
    .leftJoin(closer, eq(closer.id, leads.closerId));

  return where ? query.where(where) : query;
}
