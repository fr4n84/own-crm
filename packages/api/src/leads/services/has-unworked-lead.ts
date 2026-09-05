import { LEAD_STATE, type LeadState } from "@crm-fran/db/schema/state";

/**
 * Pure predicate: does the caller have a governed lead in `SIN_ASIGNAR` state?
 *
 * Used in `assignLeadToCaller` to prevent a caller from accumulating
 * several leads without starting work. Historical assignment epochs without a
 * marker, and epochs before the persisted activation instant, are exempt.
 */
export function hasUnworkedLead(
  leads: ReadonlyArray<{ state: LeadState; callerAssignedAt: Date | null }>,
  activatedAt: Date,
): boolean {
  return leads.some(
    (lead) =>
      lead.state === LEAD_STATE.SIN_ASIGNAR &&
      lead.callerAssignedAt !== null &&
      lead.callerAssignedAt >= activatedAt,
  );
}
