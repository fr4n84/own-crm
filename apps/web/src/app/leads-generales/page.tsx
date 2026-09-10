import { Can } from "@crm-fran/ui/permissions/can";

import { LeadAssignmentQueue } from "@/features/leads/lead-assignment-queue";
import { DuplicateReview } from "@/features/leads/duplicate-review";

export default function GeneralLeadsPage() {
  return (
    <div className="flex min-h-full flex-col gap-4">
    <Can permission="*"><div className="px-4 pt-4 sm:px-6"><DuplicateReview /></div></Can>
    <Can permission="leads:read">
      <LeadAssignmentQueue
        type="maestra"
        title="Leads generales"
        description="Leads de tipo maestra disponibles para asignación. Busca, revisa el estado del pool y conserva todas las acciones existentes."
        overlayClassName="dashboard-arc-theme"
      />
    </Can>
    </div>
  );
}
