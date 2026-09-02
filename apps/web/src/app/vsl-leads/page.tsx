import { Can } from "@crm-fran/ui/permissions/can";

import { LeadAssignmentQueue } from "@/features/leads/lead-assignment-queue";
import { AssignedLeadsTable } from "@/features/leads/assigned-leads-table";
import styles from "./vsl-leads.module.css";

export default function VslLeadsPage() {
  return (
    <div className={styles.theme}>
      <Can permission="leads:read">
        <div
          data-slot="vsl-leads-view"
          className="flex w-full min-w-0 flex-col gap-2 pb-6"
        >
          <LeadAssignmentQueue
            type="vsl"
            title="Leads VSL"
            description="Leads de tipo VSL disponibles para asignación."
            overlayClassName={styles.overlayTheme}
          />
          <AssignedLeadsTable
            type="vsl"
            title="Leads VSL asignados"
            description="Leads VSL que ya tienes asignados y están listos para registrar feedback."
            assignedOnly
            overlayClassName={styles.overlayTheme}
          />
        </div>
      </Can>
    </div>
  );
}
