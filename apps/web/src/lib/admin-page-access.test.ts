import { describe, expect, it } from "vitest";

import { resolveAdminPageAccess } from "./admin-page-access";

describe("admin page access state", () => {
  it("never reports denied while permissions are loading or failed", () => {
    expect(resolveAdminPageAccess({ permissions: [], isLoaded: false, isLoading: true, error: null })).toBe("loading");
    expect(resolveAdminPageAccess({ permissions: [], isLoaded: true, isLoading: false, error: new Error("network") })).toBe("error");
  });

  it("reports denied only after a successful permission resolution", () => {
    expect(resolveAdminPageAccess({ permissions: [], isLoaded: true, isLoading: false, error: null })).toBe("denied");
    expect(resolveAdminPageAccess({ permissions: ["*"], isLoaded: true, isLoading: false, error: null })).toBe("granted");
  });
});
