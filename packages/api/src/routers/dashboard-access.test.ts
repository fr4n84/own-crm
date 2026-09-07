import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  summary: vi.fn(),
  funnel: vi.fn(),
  quality: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../dashboard/access", () => ({ assertDashboardAccess: mocks.guard }));
vi.mock("../dashboard/dashboard-summary", () => ({ getDashboardSummary: mocks.summary }));
vi.mock("../dashboard/conversion-funnel-service", () => ({ getConversionFunnel: mocks.funnel }));
vi.mock("../dashboard/quality-controls-service", () => ({ getQualityControls: mocks.quality, updateQualitySettings: mocks.update }));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../leads/services/index", () => ({ isCloserOf: vi.fn(), hasCloserSession: vi.fn() }));

import { dashboardRouter } from "./dashboard";

const date = new Date();
const context = {
  session: {
    session: { id: "s", token: "t", userId: "u", expiresAt: date, createdAt: date, updatedAt: date },
    user: { id: "u", name: "Caller", email: "caller@example.com", emailVerified: true, accessStatus: "active", createdAt: date, updatedAt: date, roleId: "role-caller", leadActive: "", scoring: 0 },
  },
  role: { id: "role-caller", name: "Caller", permissions: ["leads:read"] },
  permissions: ["leads:read", "settings:write"],
} satisfies Context;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso al Dashboard" }));
});

describe("direct dashboard API access", () => {
  it("denies every dashboard procedure before reading or changing data", async () => {
    const caller = dashboardRouter.createCaller(context);
    await expect(caller.summary({ from: "2026-08-01", to: "2026-08-02" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.conversionFunnel({ from: "2026-08-01", to: "2026-08-02" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.qualityControls({ from: "2026-08-01", to: "2026-08-02" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.updateQualitySettings({ callerAbandonedHours: 1, closerAbandonedHours: 1, callerFollowUpGraceHours: 1, closerFollowUpGraceHours: 1, callerLowConversionPercent: 1, closerLowConversionPercent: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.guard).toHaveBeenCalledTimes(4);
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.funnel).not.toHaveBeenCalled();
    expect(mocks.quality).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
