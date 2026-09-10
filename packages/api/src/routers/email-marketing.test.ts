import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";

const service = vi.hoisted(() => ({
  listCampaigns: vi.fn(), permissionSummary: vi.fn(), recordConsent: vi.fn(), revokeConsent: vi.fn(),
  suppress: vi.fn(), liftSuppression: vi.fn(), createCampaign: vi.fn(), buildAudience: vi.fn(),
  addCopyVersion: vi.fn(), approveCopyVersion: vi.fn(), explainContact: vi.fn(),
}));

vi.mock("../email-marketing/service", () => ({ emailMarketingService: service }));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../leads/services/index", () => ({ isCloserOf: vi.fn(), hasCloserSession: vi.fn() }));

import { emailMarketingRouter } from "./email-marketing";

const now = new Date("2026-09-09T10:00:00Z");
function context(permissions: Context["permissions"]): Context {
  return {
    session: {
      session: { id: "s", token: "t", userId: "admin", expiresAt: now, createdAt: now, updatedAt: now },
      user: { id: "admin", name: "Admin", email: "admin@example.com", emailVerified: true, accessStatus: "active", createdAt: now, updatedAt: now, roleId: "role-admin", leadActive: "", scoring: 0 },
    },
    role: null,
    permissions,
  };
}

describe("email marketing router authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listCampaigns.mockResolvedValue([]);
    service.recordConsent.mockResolvedValue({ id: "permission-1" });
  });

  it("rejects non-admin users before calling the service", async () => {
    await expect(emailMarketingRouter.createCaller(context(["leads:write"])).listCampaigns()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(emailMarketingRouter.createCaller(context(["leads:write"])).deliveryCapability()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(emailMarketingRouter.createCaller(context(["leads:write"])).recordConsent({
      email: "person@example.com", source: "admin_record", evidence: "Written consent received", occurredAt: now,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.listCampaigns).not.toHaveBeenCalled();
    expect(service.recordConsent).not.toHaveBeenCalled();
  });

  it("returns the server-owned disabled delivery capability to administrators", async () => {
    await expect(emailMarketingRouter.createCaller(context(["*"])).deliveryCapability()).resolves.toEqual({
      status: "disabled", provider: null, reason: "not_configured",
    });
  });

  it("forwards the authenticated admin as audit actor", async () => {
    await emailMarketingRouter.createCaller(context(["*"])).recordConsent({
      email: "Person@Example.com", source: "admin_record", evidence: "Written consent received", occurredAt: now,
    });
    expect(service.recordConsent).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin" }));
  });

  it("rejects authority evidence dated too far in the future before calling the service", async () => {
    await expect(emailMarketingRouter.createCaller(context(["*"])).recordConsent({
      email: "person@example.com",
      source: "admin_record",
      evidence: "Written consent received",
      occurredAt: new Date("2100-01-01T00:00:00.000Z"),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.recordConsent).not.toHaveBeenCalled();
  });
});