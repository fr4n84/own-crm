import { describe, expect, it, vi } from "vitest";

import { createHealthResponse, createReadinessResponse } from "./health";

describe("health responses", () => {
  it("returns a sanitized liveness response with correlation and no caching", async () => {
    const response = createHealthResponse(
      new Request("http://localhost/api/health", {
        headers: { "x-request-id": "request_12345678" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("request_12345678");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("reports ready only after the database check succeeds", async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const response = await createReadinessResponse(
      new Request("http://localhost/api/ready"),
      check,
      { createId: () => "generated-request-id" },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      checks: { database: "ok" },
    });
    expect(check).toHaveBeenCalledOnce();
  });

  it("returns a sanitized 503 and records the correlated readiness failure", async () => {
    const report = vi.fn();
    const response = await createReadinessResponse(
      new Request("http://localhost/api/ready", {
        headers: { "x-request-id": "request_87654321" },
      }),
      () => Promise.reject(new Error("postgres://user:password@host/db")),
      { reportError: report },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBe("request_87654321");
    expect(await response.json()).toEqual({
      status: "unavailable",
      checks: { database: "failed" },
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain("password");
  });
});
