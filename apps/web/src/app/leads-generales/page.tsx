import { Can } from "@crm-fran/ui/permissions/can";

import { LeadAssignmentQueue } from "@/features/leads/lead-assignment-queue";

export default function GeneralLeadsPage() {
  return (
    <Can permission="leads:read">
      <LeadAssignmentQueue
        type="maestra"
        title="Leads generales"
        description="Leads de tipo maestra disponibles para asignación. Busca, revisa el estado del pool y conserva todas las acciones existentes."
        overlayClassName="dashboard-arc-theme"
      />
    </Can>
  );
}
