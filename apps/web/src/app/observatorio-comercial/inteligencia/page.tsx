import { Can } from "@crm-fran/ui/permissions/can";

import { CommercialIntelligencePanel } from "@/features/commercial-observatory/commercial-intelligence-panel";

export default function CommercialIntelligencePage() {
  return (
    <Can permission="leads:read">
      <CommercialIntelligencePanel />
    </Can>
  );
}
