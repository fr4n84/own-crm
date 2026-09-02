import { Can } from "@crm-fran/ui/permissions/can";

import { MarketingLibraryPanel } from "@/features/commercial-observatory/marketing-library-panel";

export default function MarketingLibraryPage() {
  return (
    <Can permission="*">
      <MarketingLibraryPanel />
    </Can>
  );
}
