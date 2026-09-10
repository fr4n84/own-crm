import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: { session: null as null | { user: { id: string } }, permissions: [] as string[] },
  export: vi.fn(),
}));
vi.mock("@crm-fran/api/context", () => ({ createContext: vi.fn(() => mocks.context) }));
vi.mock("@crm-fran/api/permissions", () => ({ hasPermission: (permissions: string[], required: string[]) => required.every((item) => permissions.includes(item)) }));
vi.mock("@crm-fran/api/admin-export/service", () => ({ buildAdminDataExport: mocks.export }));

import { GET } from "./route";

const request = (query = "from=2026-09-01&to=2026-09-07&currency=EUR") => ({
  headers: new Headers(),
  nextUrl: new URL(`http://localhost/api/admin/exports?${query}`),
}) as never;

describe("admin export download", () => {
  beforeEach(() => {
    mocks.context = { session: null, permissions: [] };
    mocks.export.mockReset();
    mocks.export.mockResolvedValue({ bytes: Uint8Array.from([0x50, 0x4b]), fileName: "crm-export.zip" });
  });
  it("rejects signed-out and non-admin requests before exporting PII", async () => {
    expect((await GET(request())).status).toBe(401);
    mocks.context = { session: { user: { id: "caller" } }, permissions: ["sales:read"] };
    expect((await GET(request())).status).toBe(403);
    expect(mocks.export).not.toHaveBeenCalled();
  });
  it("returns an audited ZIP contract only to wildcard Admin", async () => {
    mocks.context = { session: { user: { id: "admin" } }, permissions: ["*"] };
    const response = await GET(request("from=2026-09-01&to=2026-09-07&currency=EUR&includePii=true"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="crm-export.zip"');
    expect(mocks.export).toHaveBeenCalledWith(expect.objectContaining({ authority: { actorId: "admin", permissions: ["*"] }, includePii: true }));
  });
  it("rejects unbounded exports before querying data", async () => {
    mocks.context = { session: { user: { id: "admin" } }, permissions: ["*"] };
    expect((await GET(request("from=2020-01-01&to=2026-09-07&currency=EUR"))).status).toBe(400);
    expect(mocks.export).not.toHaveBeenCalled();
  });
});
