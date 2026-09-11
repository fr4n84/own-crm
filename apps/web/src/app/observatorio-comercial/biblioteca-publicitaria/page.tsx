import { Can } from "@crm-fran/ui/permissions/can";

import { AdvertisingLibraryView } from "@/features/commercial-observatory/advertising-library-view";

export default function MarketingLibraryPage() {
  return (
    <Can permission="leads:read">
      <AdvertisingLibraryView />
    </Can>
  );
}
