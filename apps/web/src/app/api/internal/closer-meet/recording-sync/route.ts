import { env } from "@crm-fran/env/server";

import { hasValidBearerCredential } from "@/lib/machine-auth";
import { createRequestId, reportServerError } from "@/lib/server-observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const configuredSecret = env.CLOSER_MEET_SYNC_SECRET;
  if (!configuredSecret) return json({ error: "Service unavailable" }, 503);
  if (!hasValidBearerCredential(request.headers.get("authorization"), configuredSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const { createCloserMeetRecordingSyncRuntime } = await import(
      "@crm-fran/api/closer-meet/recording-sync-runtime"
    );
    const syncRuntime = createCloserMeetRecordingSyncRuntime();
    if (!syncRuntime) return json({ error: "Service unavailable" }, 503);

    const result = await syncRuntime.run();
    return json({ synced: result.synced, failed: result.errors.length }, 200);
  } catch (error) {
    reportServerError({
      requestId,
      operation: "closerMeet.recordingSync",
      error,
    });
    return json({ error: "Recording sync failed" }, 500);
  }
}

