import { LEAD_STATE, type LeadState } from "@crm-fran/db/schema/state";

/**
 * Pure predicate: does the caller have at least one lead in `SIN_ASIGNAR` state?
 *
 * Used in `assignLeadToCaller` to prevent a caller from accumulating
 * several leads without starting work. A lead in `SIN_ASIGNAR` means
 * "assigned to a caller but not yet processed".
 */
export function hasUnworkedLead(
  leads: ReadonlyArray<{ state: LeadState }>,
): boolean {
  return leads.some((lead) => lead.state === LEAD_STATE.SIN_ASIGNAR);
}
