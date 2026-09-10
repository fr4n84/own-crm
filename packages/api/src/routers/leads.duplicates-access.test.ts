import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const leadServices = vi.hoisted(() => ({
  isCloserOf: vi.fn(),
  hasCloserSession: vi.fn(),
  createLead: vi.fn(),
}));
const duplicateServices = vi.hoisted(() => ({
  listDuplicateCases: vi.fn(),
  mergeDuplicateCase: vi.fn(),
  mergeDuplicateBatch: vi.fn(),
  dismissDuplicateCase: vi.fn(),
}));

vi.mock("../leads/services/index", () => leadServices);
vi.mock("@crm-fran/db", () => ({
  db: {},
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  or: (...values: unknown[]) => values,
}));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../call-feedback-runtime", () => ({ getMonthlyCallFeedbackUsage: vi.fn() }));
vi.mock("../leads/duplicates/service", () => duplicateServices);

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

const batchEntry = { caseId: "case", canonicalLeadId: "lead" };

describe("lead duplicate administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-wildcard users before listing, merging, dismissing or batching", async () => {
    const caller = leadsRouter.createCaller(context(["leads:read", "leads:write"]));
    await expect(caller.duplicateCases()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.mergeDuplicate(batchEntry)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.dismissDuplicate({ caseId: "case" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.mergeDuplicateBatch({ entries: [batchEntry] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forwards stable pagination and the real Admin actor to batch merge", async () => {
    duplicateServices.listDuplicateCases.mockResolvedValue({ items: [], nextCursor: null });
    duplicateServices.mergeDuplicateBatch.mockResolvedValue([]);
    const admin = leadsRouter.createCaller(context(["*"]));
    const cursor = { createdAt: "2026-09-10T10:00:00.000Z", id: "case-20" };

    await admin.duplicateCases({ pageSize: 50, cursor });
    await admin.mergeDuplicateBatch({ entries: [batchEntry] });

    expect(duplicateServices.listDuplicateCases).toHaveBeenCalledWith({ pageSize: 50, cursor });
    expect(duplicateServices.mergeDuplicateBatch).toHaveBeenCalledWith({
      entries: [batchEntry],
      actorId: "user",
    });
  });

  it("rejects page sizes and batches above the bounded maximum", async () => {
    const admin = leadsRouter.createCaller(context(["*"]));
    await expect(admin.duplicateCases({ pageSize: 51 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.mergeDuplicateBatch({
      entries: Array.from({ length: 51 }, (_, index) => ({
        caseId: "case-" + index,
        canonicalLeadId: "lead-" + index,
      })),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(duplicateServices.listDuplicateCases).not.toHaveBeenCalled();
    expect(duplicateServices.mergeDuplicateBatch).not.toHaveBeenCalled();
  });

  it("passes the authenticated writer as lead creation audit actor", async () => {
    leadServices.createLead.mockResolvedValue({ id: "lead" });
    const writer = leadsRouter.createCaller(context(["leads:write"]));
    const input = {
      name: "María López",
      email: "maria@example.com",
      phone: "612345678",
      type: "maestra" as const,
    };

    await writer.create(input);

    expect(leadServices.createLead).toHaveBeenCalledWith(input, "user");
  });
});