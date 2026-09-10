import { describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
vi.mock("../leads/services/index", () => ({ isCloserOf: vi.fn(), hasCloserSession: vi.fn() }));
vi.mock("@crm-fran/db", () => ({
  db: {},
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  or: (...values: unknown[]) => values,
}));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../call-feedback-runtime", () => ({ getMonthlyCallFeedbackUsage: vi.fn() }));
vi.mock("../leads/duplicates/service", () => ({
  listDuplicateCases: vi.fn(),
  mergeDuplicateCase: vi.fn(),
  dismissDuplicateCase: vi.fn(),
}));

import { leadsRouter } from "./leads";

const date = new Date();
function context(permissions: Context["permissions"]): Context {
  return {
    session: {
      session: { id: "session", token: "token", userId: "user", expiresAt: date, createdAt: date, updatedAt: date },
      user: { id: "user", name: "User", email: "user@example.com", emailVerified: true, accessStatus: "active", createdAt: date, updatedAt: date, roleId: "role-caller", leadActive: "", scoring: 0 },
    },
    role: null,
    permissions,
  };
}

describe("lead duplicate administration", () => {
  it("rejects non-wildcard users before listing, merging or dismissing", async () => {
    const caller = leadsRouter.createCaller(context(["leads:read", "leads:write"]));
    await expect(caller.duplicateCases()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.mergeDuplicate({ caseId: "case", canonicalLeadId: "lead" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.dismissDuplicate({ caseId: "case" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
