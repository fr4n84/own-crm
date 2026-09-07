import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ settings: vi.fn() }));
vi.mock("../users/services/navigation-visibility", () => ({ getNavigationVisibility: mocks.settings }));

import { assertDashboardAccess } from "./access";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({ configured: false, roleIdsByModule: {} });
});

describe("dashboard server access", () => {
  for (const roleId of ["role-caller", "role-closer", "role-caller-closer", "role-admin"]) {
    it(`preserves the unconfigured fallback for ${roleId}`, async () => {
      await expect(assertDashboardAccess(roleId, roleId === "role-admin" ? ["*"] : ["leads:read"])).resolves.toBeUndefined();
    });
  }

  it("obeys the configured role matrix exactly", async () => {
    mocks.settings.mockResolvedValue({
      configured: true,
      roleIdsByModule: { dashboard: ["role-closer", "role-caller-closer", "role-admin"] },
    });
    await expect(assertDashboardAccess("role-caller", ["leads:read"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const roleId of ["role-closer", "role-caller-closer", "role-admin"]) {
      await expect(assertDashboardAccess(roleId, roleId === "role-admin" ? ["*"] : ["leads:read"])).resolves.toBeUndefined();
    }
  });

  it("never substitutes configured visibility for the underlying lead permission", async () => {
    mocks.settings.mockResolvedValue({ configured: true, roleIdsByModule: { dashboard: ["role-caller"] } });
    await expect(assertDashboardAccess("role-caller", [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed if visibility cannot be read", async () => {
    mocks.settings.mockRejectedValue(new Error("configuration unavailable"));
    await expect(assertDashboardAccess("role-caller", ["leads:read"])).rejects.toThrow("configuration unavailable");
  });
});
