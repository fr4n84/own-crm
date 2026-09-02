import { and, eq, isNull } from "@crm-fran/db";
import {
  leads,
  LEAD_POOL_STATUS,
  type LeadPoolStatus,
  type LeadType,
} from "@crm-fran/db/schema/index";
import { processRecurringAlerts } from "../../alerts/services/process-recurring";
import { selectLeadWithUsers } from "../queries/index";

export async function getWithoutAssigned({
  type,
  poolStatus = LEAD_POOL_STATUS.NEW,
}: {
  type: LeadType;
  poolStatus?: LeadPoolStatus;
}) {
  await processRecurringAlerts();

  return selectLeadWithUsers(
    and(
      isNull(leads.callerId),
      isNull(leads.closerId),
      eq(leads.type, type),
      eq(leads.poolStatus, poolStatus),
    ),
  );
}
