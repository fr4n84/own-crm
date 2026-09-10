import { checkDatabaseReadiness } from "@crm-fran/api/health";

import { createReadinessResponse } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return createReadinessResponse(request, checkDatabaseReadiness);
}
