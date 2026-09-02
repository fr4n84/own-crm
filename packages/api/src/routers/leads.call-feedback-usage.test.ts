import { describe, expect, it, vi } from "vitest";

import type { Permission } from "@crm-fran/db/schema/auth";
import type { Context } from "../context";

const { getMonthlyCallFeedbackUsage } = vi.hoisted(() => ({
  getMonthlyCallFeedbackUsage: vi.fn().mockResolvedValue({
    processedDurationMs: 60_000,
    estimatedCostMicroUsd: 3_000,
    recordings: 1,
    referenceMinutes: 5_000,
    pricingVersion: "test",
  }),
}));

vi.mock("../call-feedback-runtime", () => ({ getMonthlyCallFeedbackUsage }));

import { appRouter } from "./index";

function caller(permissions: Permission[]) {
  const ctx = {
    session: { user: { id: "user-1", roleId: "role-test" } },
    role: { id: "role-test", name: "Test", permissions },
    permissions,
  } as Context;
  return appRouter.createCaller(ctx);
}

describe("monthly call feedback usage", () => {
  it("is visible only to wildcard administrators", async () => {
    getMonthlyCallFeedbackUsage.mockClear();
    await expect(
      caller(["leads:read"]).leads.monthlyCallFeedbackUsage(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getMonthlyCallFeedbackUsage).not.toHaveBeenCalled();
    await expect(
      caller(["*"]).leads.monthlyCallFeedbackUsage(),
    ).resolves.toMatchObject({ referenceMinutes: 5_000 });
    expect(getMonthlyCallFeedbackUsage).toHaveBeenCalledOnce();
  });
});
