import { File as NodeFile } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  store: vi.fn(),
  remove: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@crm-fran/api/context", () => ({ createContext: mocks.createContext }));
vi.mock("@crm-fran/api/permissions", () => ({
  hasPermission: (permissions: string[], required: string[]) =>
    permissions.includes("*") || required.every((item) => permissions.includes(item)),
}));
vi.mock("@crm-fran/api/marketing-attribution/runtime", () => ({
  transcribeMarketingAsset: mocks.transcribe,
}));
vi.mock("@/lib/marketing-asset-storage", () => ({
  storeMarketingAsset: mocks.store,
  deleteMarketingAsset: mocks.remove,
}));

import { POST } from "./route";

function request(file: NodeFile, transcribe = "false") {
  const values = new Map<string, FormDataEntryValue>([
    ["asset", file as unknown as File],
    ["transcribe", transcribe],
  ]);
  return {
    headers: new Headers({ "content-length": String(file.size + 256) }),
    formData: async () => ({ get: (key: string) => values.get(key) ?? null }) as FormData,
  } as NextRequest;
}

describe("POST /api/marketing-assets", () => {
  beforeEach(() => {
    mocks.createContext.mockReset().mockResolvedValue({
      session: { user: { id: "admin-1" } },
      permissions: ["*"],
    });
    mocks.store.mockReset().mockResolvedValue({
      storageKey: "00000000-0000-4000-8000-000000000001.mp4",
      fileName: "anuncio.mp4",
      mimeType: "video/mp4",
      sizeBytes: 5,
      checksum: "a".repeat(64),
    });
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.transcribe.mockReset().mockResolvedValue("Transcripción del anuncio");
  });

  it("requires global administration", async () => {
    mocks.createContext.mockResolvedValueOnce({ session: null, permissions: [] });
    expect((await POST(request(new NodeFile(["x"], "ad.mp4", { type: "video/mp4" })))).status).toBe(401);
    mocks.createContext.mockResolvedValueOnce({ session: { user: { id: "u" } }, permissions: ["leads:read"] });
    expect((await POST(request(new NodeFile(["x"], "ad.mp4", { type: "video/mp4" })))).status).toBe(403);
  });

  it("stores an allowed asset and optionally transcribes media", async () => {
    const response = await POST(
      request(new NodeFile(["video"], "anuncio.mp4", { type: "video/mp4" }), "true"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transcript: "Transcripción del anuncio" });
    expect(mocks.store).toHaveBeenCalledOnce();
    expect(mocks.transcribe).toHaveBeenCalledOnce();
  });

  it("rejects executable content before storing it", async () => {
    const response = await POST(
      request(new NodeFile(["bad"], "payload.exe", { type: "application/octet-stream" })),
    );
    expect(response.status).toBe(415);
    expect(mocks.store).not.toHaveBeenCalled();
  });
});
