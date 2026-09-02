import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { File as NodeFile } from "node:buffer";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@crm-fran/api/context", () => ({ createContext: mocks.createContext }));
vi.mock("@crm-fran/api/call-feedback-runtime", () => ({
  processProductionCallRecording: mocks.process,
}));
vi.mock("@crm-fran/api/permissions", () => ({
  hasPermission: (permissions: string[], required: string[]) =>
    permissions.includes("*") || required.every((item) => permissions.includes(item)),
}));

import { POST } from "./route";

function context(permissions: string[] = ["leads:write"]) {
  return {
    session: { user: { id: "caller-1" } },
    permissions,
  };
}

function request({
  file = new NodeFile(["audio"], "call.webm", { type: "audio/webm" }),
  durationMs = "60000",
  contentLength = "1024",
}: {
  file?: NodeFile;
  durationMs?: string;
  contentLength?: string;
} = {}) {
  const values = new Map<string, FormDataEntryValue>([
    ["audio", file as unknown as File],
    ["leadId", "lead-1"],
    ["durationMs", durationMs],
  ]);
  const formData = {
    get: (key: string) => values.get(key) ?? null,
  } as FormData;
  return {
    headers: new Headers({ "content-length": contentLength }),
    formData: async () => formData,
  } as NextRequest;
}

describe("POST /api/call-feedback", () => {
  beforeEach(() => {
    mocks.createContext.mockReset().mockResolvedValue(context());
    mocks.process.mockReset().mockResolvedValue({ draft: {}, usage: {} });
  });

  it("rejects unauthenticated and forbidden callers before processing", async () => {
    mocks.createContext.mockResolvedValueOnce({ session: null, permissions: [] });
    expect((await POST(request())).status).toBe(401);
    mocks.createContext.mockResolvedValueOnce(context(["leads:read"]));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME, excessive size and invalid duration", async () => {
    const invalidMime = new NodeFile(["audio"], "call.txt", { type: "text/plain" });
    expect((await POST(request({ file: invalidMime }))).status).toBe(415);

    const large = new NodeFile(["audio"], "call.webm", { type: "audio/webm" });
    Object.defineProperty(large, "size", { value: 20 * 1024 * 1024 + 1 });
    expect((await POST(request({ file: large }))).status).toBe(413);
    expect((await POST(request({ durationMs: "999" }))).status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects missing or excessive request lengths before parsing the body", async () => {
    expect((await POST(request({ contentLength: "" }))).status).toBe(411);
    expect(
      (await POST(request({ contentLength: String(21 * 1024 * 1024 + 1) }))).status,
    ).toBe(413);
    expect(mocks.createContext).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("processes a bounded recording and maps provider failures", async () => {
    const browserRecording = new NodeFile(["audio"], "call.webm", {
      type: "audio/webm;codecs=opus",
    });
    expect((await POST(request({ file: browserRecording }))).status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: 60_000,
        leadId: "lead-1",
        userId: "caller-1",
      }),
    );

    mocks.process.mockRejectedValueOnce(new Error("provider failed"));
    expect((await POST(request())).status).toBe(502);
  });
});
