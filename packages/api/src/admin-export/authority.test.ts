import { describe, expect, it } from "vitest";

import { assertAdminExportAuthority } from "./authority";

describe("admin export service authority", () => {
  it("rejects non-Admin authority at the service boundary", () => {
    expect(() => assertAdminExportAuthority({ actorId: "caller", permissions: ["sales:read"] })).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(assertAdminExportAuthority({ actorId: "admin", permissions: ["*"] })).toEqual({ actorId: "admin", permissions: ["*"] });
  });
});
