import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;
const SENSITIVE_KEY =
  /(?:authorization|cookie|token|secret|password|email|phone|leadId|userId|audio|transcript|body|payload)/i;
const SAFE_ERROR_CODE = /^[A-Z0-9_.-]{1,64}$/;

type LogValue = null | boolean | number | string | LogValue[] | { [key: string]: LogValue };

export type ServerErrorEvent = {
  level: "error";
  event: "server_error";
  requestId: string;
  operation: string;
  error: { name: string; code?: string };
  context?: LogValue;
};

export function createRequestId(
  incoming: string | null | undefined,
  generate: () => string = randomUUID,
) {
  const candidate = incoming?.trim();
  return candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : generate();
}

export function sanitizeLogContext(value: unknown, depth = 0): LogValue {
  if (depth > 5) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return value.slice(0, 256);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeLogContext(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeLogContext(item, depth + 1),
        ]),
    );
  }
  return String(value).slice(0, 256);
}

export function createServerErrorEvent(input: {
  requestId: string;
  operation: string;
  error: unknown;
  context?: unknown;
}): ServerErrorEvent {
  const error = input.error instanceof Error ? input.error : undefined;
  const codeCandidate =
    typeof input.error === "object" && input.error !== null && "code" in input.error
      ? String(input.error.code)
      : undefined;
  const code = codeCandidate && SAFE_ERROR_CODE.test(codeCandidate) ? codeCandidate : undefined;
  return {
    level: "error",
    event: "server_error",
    requestId: input.requestId,
    operation: input.operation,
    error: {
      name: error?.name ?? "UnknownError",
      ...(code ? { code } : {}),
    },
    ...(input.context === undefined
      ? {}
      : { context: sanitizeLogContext(input.context) }),
  };
}

export function reportServerError(
  input: Parameters<typeof createServerErrorEvent>[0],
  write: (event: ServerErrorEvent) => void = (event) => console.error(JSON.stringify(event)),
) {
  write(createServerErrorEvent(input));
}

export function shouldReportServerError(code: string) {
  return code === "INTERNAL_SERVER_ERROR" || code === "TIMEOUT";
}
