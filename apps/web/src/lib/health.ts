import {
  createRequestId,
  createServerErrorEvent,
  type ServerErrorEvent,
} from "./server-observability";

const READINESS_TIMEOUT_MS = 2_000;

function responseHeaders(requestId: string) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
  };
}

export function createHealthResponse(
  request: Request,
  options: { createId?: () => string } = {},
) {
  const requestId = createRequestId(
    request.headers.get("x-request-id"),
    options.createId,
  );
  return Response.json(
    { status: "ok" },
    { status: 200, headers: responseHeaders(requestId) },
  );
}

function withTimeout(check: () => Promise<void>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    check(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Readiness check timed out")), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function createReadinessResponse(
  request: Request,
  checkDatabase: () => Promise<void>,
  options: {
    createId?: () => string;
    reportError?: (event: ServerErrorEvent) => void;
    timeoutMs?: number;
  } = {},
) {
  const requestId = createRequestId(
    request.headers.get("x-request-id"),
    options.createId,
  );
  try {
    await withTimeout(checkDatabase, options.timeoutMs ?? READINESS_TIMEOUT_MS);
    return Response.json(
      { status: "ready", checks: { database: "ok" } },
      { status: 200, headers: responseHeaders(requestId) },
    );
  } catch (error) {
    const event = createServerErrorEvent({
      requestId,
      operation: "readiness.database",
      error,
    });
    (options.reportError ?? ((entry) => console.error(JSON.stringify(entry))))(event);
    return Response.json(
      { status: "unavailable", checks: { database: "failed" } },
      { status: 503, headers: responseHeaders(requestId) },
    );
  }
}
