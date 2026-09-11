import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { COMPETITOR_AD_SYNC_SECRET: undefined as string | undefined },
  run: vi.fn(),
  createRuntime: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock("@crm-fran/env/server", () => ({ env: mocks.env }));
vi.mock("@crm-fran/api/competitor-ads/runtime", () => ({ createCompetitorAdSyncRuntime: mocks.createRuntime }));
vi.mock("@/lib/server-observability", () => ({
  createRequestId: vi.fn(() => "request-12345678"),
  reportServerError: mocks.reportError,
}));

import { POST } from "./route";

const SECRET = "a-secure-machine-secret-with-32-characters";
function request(authorization?: string) {
  return new Request("http://localhost/api/internal/competitor-ads/daily-sync", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

describe("competitor ad daily sync endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.COMPETITOR_AD_SYNC_SECRET = SECRET;
    mocks.run.mockResolvedValue({
      id: "run-1",
      status: "succeeded",
      competitorCount: 1,
      adsSeen: 2,
      failureCodes: [],
    });
    mocks.createRuntime.mockReturnValue({ run: mocks.run });
  });

  it("fails closed before loading the runtime when the machine secret is absent", async () => {
    mocks.env.COMPETITOR_AD_SYNC_SECRET = undefined;
    const response = await POST(request('Bearer ' + SECRET));
    expect(response.status).toBe(503);
    expect(mocks.createRuntime).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer credentials", async () => {
    const response = await POST(request("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(mocks.createRuntime).not.toHaveBeenCalled();
  });

  it("returns only aggregate audit data", async () => {
    const response = await POST(request('Bearer ' + SECRET));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      runId: "run-1",
      status: "succeeded",
      competitorCount: 1,
      adsSeen: 2,
      failureCount: 0,
    });
  });

  it("stays unavailable while the provider runtime is disabled", async () => {
    mocks.createRuntime.mockReturnValue(null);
    const response = await POST(request('Bearer ' + SECRET));
    expect(response.status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
