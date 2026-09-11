import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  listSources: vi.fn(),
  saveSource: vi.fn(),
  setSourceEnabled: vi.fn(),
  navigationVisibility: vi.fn(),
}));

vi.mock("../competitor-ads/repository", () => ({
  competitorAdRepository: {
    getOverview: mocks.getOverview,
    listSources: mocks.listSources,
    upsertSource: mocks.saveSource,
    setSourceEnabled: mocks.setSourceEnabled,
    listRecentRuns: vi.fn(),
  },
}));

vi.mock("../users/services/navigation-visibility", () => ({
  getNavigationVisibility: mocks.navigationVisibility,
}));

import { competitorAdsRouter } from "./competitor-ads";

const now = new Date("2026-09-11T08:00:00.000Z");

function context(permissions: Context["permissions"], roleId = "role-manager"): Context {
  return {
    session: {
      session: {
        id: "session-1",
        token: "token",
        userId: "user-1",
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      },
      user: {
        id: "user-1",
        name: "User",
        email: "user@example.com",
        emailVerified: true,
        accessStatus: "active",
        createdAt: now,
        updatedAt: now,
        roleId,
        leadActive: "",
        scoring: 0,
      },
    },
    role: { id: roleId, name: roleId, permissions },
    permissions,
  };
}

describe("competitor ads router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.navigationVisibility.mockResolvedValue({ configured: false, roleIdsByModule: {} });
    mocks.getOverview.mockResolvedValue({ sources: [], ads: [], runs: [] });
    mocks.listSources.mockResolvedValue([]);
    mocks.saveSource.mockResolvedValue({ id: "source-1" });
    mocks.setSourceEnabled.mockResolvedValue(true);
  });

  it("lets an authorized Observatory viewer read sanitized intelligence", async () => {
    const caller = competitorAdsRouter.createCaller(context(["leads:read"]));

    await expect(caller.overview()).resolves.toEqual({ sources: [], ads: [], runs: [] });
    expect(mocks.getOverview).toHaveBeenCalledWith(50, 20);
  });

  it("keeps competitor configuration mutations Admin-only", async () => {
    const caller = competitorAdsRouter.createCaller(
      context(["leads:read", "users:read", "users:write"]),
    );

    await expect(caller.listSources()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.saveSource({
      metaPageId: "123456",
      displayName: "Competitor",
      countries: ["ES"],
      enabled: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.setSourceEnabled({
      id: "00000000-0000-4000-8000-000000000001",
      enabled: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.saveSource).not.toHaveBeenCalled();
    expect(mocks.setSourceEnabled).not.toHaveBeenCalled();
  });

  it("allows Admin to configure normalized competitor countries", async () => {
    const caller = competitorAdsRouter.createCaller(context(["*"]));

    await caller.saveSource({
      metaPageId: "123456",
      displayName: "Competitor",
      countries: ["PT", "ES", "PT"],
      enabled: true,
    });

    expect(mocks.saveSource).toHaveBeenCalledWith(expect.objectContaining({
      metaPageId: "123456",
      countries: ["ES", "PT"],
      actorId: "user-1",
    }));
  });
});
