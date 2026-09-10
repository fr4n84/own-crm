import type { ReactNode } from "react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";

export function EmailMarketingAccessBoundary({ permissions, children }: { permissions: readonly string[]; children: ReactNode }) {
  if (!permissions.includes("*")) {
    return <Empty heading="Acceso restringido" description="Email Marketing requiere administración global. La API vuelve a comprobar esta autorización en cada operación." />;
  }
  return <>{children}</>;
}

export function EmailMarketingDeliveryStatus({ capability }: { capability: { status: "disabled"; provider: null; reason: "not_configured" } }) {
  return <Card size="sm">
    <CardHeader>
      <div className="flex flex-wrap items-center gap-2"><CardTitle>Delivery</CardTitle><Badge variant="outline">Disabled</Badge></div>
      <CardDescription>Delivery not configured/disabled</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">No provider adapter, credentials, endpoint, worker, or send action is active. Campaigns marked ready are preparation-only.</p>
      <span className="sr-only">{capability.reason}</span>
    </CardContent>
  </Card>;
}
