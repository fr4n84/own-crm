import { describe, expect, it, vi } from "vitest";

import {
  createRequestId,
  reportServerError,
  sanitizeLogContext,
  shouldReportServerError,
} from "./server-observability";

describe("server observability", () => {
  it("keeps a safe caller request id and replaces malformed values", () => {
    expect(createRequestId("request_12345678", () => "generated-id")).toBe(
      "request_12345678",
    );
    expect(createRequestId("email@example.com", () => "generated-id")).toBe(
      "generated-id",
    );
    expect(createRequestId("short", () => "generated-id")).toBe("generated-id");
  });

  it("redacts secrets and direct identifiers recursively", () => {
    expect(
      sanitizeLogContext({
        route: "/api/trpc/leads.list",
        authorization: "Bearer secret",
        nested: {
          email: "person@example.com",
          phone: "+34123456789",
          leadId: "lead-1",
        },
      }),
    ).toEqual({
      route: "/api/trpc/leads.list",
      authorization: "[REDACTED]",
      nested: {
        email: "[REDACTED]",
        phone: "[REDACTED]",
        leadId: "[REDACTED]",
      },
    });
  });

  it("logs a correlated error without the message, stack or supplied PII", () => {
    const write = vi.fn();
    const error = new Error("Database failed for person@example.com");
    error.stack = "secret stack";

    reportServerError(
      {
        requestId: "request_12345678",
        operation: "trpc.request",
        error,
        context: { path: "leads.list", email: "person@example.com" },
      },
      write,
    );

    const serialized = JSON.stringify(write.mock.calls[0]?.[0]);
    expect(serialized).toContain("request_12345678");
    expect(serialized).toContain("trpc.request");
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("Database failed");
    expect(serialized).not.toContain("secret stack");
  });

  it("reports unexpected server failures but not expected authorization errors", () => {
    expect(shouldReportServerError("INTERNAL_SERVER_ERROR")).toBe(true);
    expect(shouldReportServerError("TIMEOUT")).toBe(true);
    expect(shouldReportServerError("FORBIDDEN")).toBe(false);
    expect(shouldReportServerError("BAD_REQUEST")).toBe(false);
  });
});
