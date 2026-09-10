import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { CLOSER_MEET_SYNC_SECRET: undefined as string | undefined },
  run: vi.fn(),
  createRuntime: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@crm-fran/env/server", () => ({ env: mocks.env }));
vi.mock("@crm-fran/api/closer-meet/recording-sync-runtime", () => ({
  createCloserMeetRecordingSyncRuntime: mocks.createRuntime,
}));
vi.mock("@/lib/server-observability", () => ({
  createRequestId: vi.fn(() => "request-12345678"),
  reportServerError: mocks.reportError,
}));

import { POST } from "./route";

const SECRET = "a-secure-machine-secret-with-32-characters";
function request(authorization?: string) {
  return new Request("http://localhost/api/internal/closer-meet/recording-sync", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

describe("Closer Meet machine recording sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.CLOSER_MEET_SYNC_SECRET = SECRET;
    mocks.run.mockResolvedValue({ synced: 2, errors: [] });
    mocks.createRuntime.mockReturnValue({ run: mocks.run });
  });

  it("loads the Google and database runtime only after bearer authentication", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/internal/closer-meet/recording-sync/route.ts"), "utf8");

    expect(source).not.toMatch(/^import .*recording-sync-runtime/m);
    expect(source).toContain('await import(');
    expect(source.indexOf("hasValidBearerCredential")).toBeLessThan(
      source.indexOf('await import('),
    );
  });
  it("fails closed when the machine credential is not configured", async () => {
    mocks.env.CLOSER_MEET_SYNC_SECRET = undefined;

    const response = await POST(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Service unavailable" });
    expect(mocks.createRuntime).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "Bearer wrong-secret",
    `Bearer ${"x".repeat(128)}`,
    "Bearer two tokens",
    "Basic credentials",
  ])("rejects a missing, malformed, or incorrect machine credential", async (authorization) => {
    const response = await POST(request(authorization));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.createRuntime).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs the existing idempotent sync once and returns only aggregate results", async () => {
    mocks.run.mockResolvedValue({
      synced: 2,
      errors: [{ sessionId: "private-session", stage: "recording_sync", message: "private provider detail" }],
    });

    const response = await POST(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ synced: 2, failed: 1 });
    expect(mocks.createRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it("returns a safe failure envelope without exposing provider errors", async () => {
    mocks.run.mockRejectedValue(new Error("sensitive Google response"));

    const response = await POST(request(`Bearer ${SECRET}`));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toBe('{"error":"Recording sync failed"}');
    expect(body).not.toContain("Google");
    expect(mocks.reportError).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-12345678",
      operation: "closerMeet.recordingSync",
    }));
  });

  it("fails closed when Google Workspace runtime is unavailable", async () => {
    mocks.createRuntime.mockReturnValue(null);

    const response = await POST(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Service unavailable" });
    expect(mocks.run).not.toHaveBeenCalled();
  });
});


