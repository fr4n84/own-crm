import { env } from "@crm-fran/env/server";

import { hasValidBearerCredential } from "@/lib/machine-auth";
import { createRequestId, reportServerError } from "@/lib/server-observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const configuredSecret = env.COMPETITOR_AD_SYNC_SECRET;
  if (!configuredSecret) return json({ error: "Service unavailable" }, 503);
  if (!hasValidBearerCredential(request.headers.get("authorization"), configuredSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const { createCompetitorAdSyncRuntime } = await import("@crm-fran/api/competitor-ads/runtime");
    const syncRuntime = createCompetitorAdSyncRuntime();
    if (!syncRuntime) return json({ error: "Service unavailable" }, 503);
    const result = await syncRuntime.run();
    return json({
      runId: result.id,
      status: result.status,
      competitorCount: result.competitorCount,
      adsSeen: result.adsSeen,
      failureCount: result.failureCodes.length,
    }, 200);
  } catch (error) {
    reportServerError({ requestId, operation: "competitorAds.dailySync", error });
    return json({ error: "Competitor ad sync failed" }, 500);
  }
}
