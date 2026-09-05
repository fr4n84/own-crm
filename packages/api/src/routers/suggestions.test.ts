import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";

const persistence = vi.hoisted(() => ({ inserted: vi.fn(), rows: vi.fn() }));
vi.mock("@crm-fran/db", () => ({
  db: {
    insert: () => ({ values: (value: unknown) => { persistence.inserted(value); return { returning: async () => [{ id: "suggestion-1", createdAt: new Date("2026-09-05") }] }; } }),
    select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: persistence.rows }) }) }),
  },
  desc: vi.fn(), eq: vi.fn(),
}));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../leads/services/index", () => ({ isCloserOf: vi.fn(), hasCloserSession: vi.fn() }));

import { suggestionsRouter } from "./suggestions";

const now = new Date("2026-09-05T10:00:00Z");
function context(permissions: Context["permissions"]): Context {
  return { session: { session: { id: "s", token: "t", userId: "u1", expiresAt: now, createdAt: now, updatedAt: now }, user: { id: "u1", name: "User", email: "u@example.com", emailVerified: true, createdAt: now, updatedAt: now, roleId: "role-caller", leadActive: "", scoring: 0 } }, role: null, permissions };
}

describe("suggestions router", () => {
  beforeEach(() => { vi.clearAllMocks(); persistence.rows.mockResolvedValue([]); });
  it("stores no author for an anonymous authenticated suggestion", async () => {
    await suggestionsRouter.createCaller(context([])).create({ body: "  Idea  ", anonymous: true });
    expect(persistence.inserted).toHaveBeenCalledWith(expect.objectContaining({ body: "Idea", isAnonymous: true, authorUserId: null }));
  });
  it("records the author when identified", async () => {
    await suggestionsRouter.createCaller(context([])).create({ body: "Idea", anonymous: false });
    expect(persistence.inserted).toHaveBeenCalledWith(expect.objectContaining({ authorUserId: "u1" }));
  });
  it("allows only wildcard administrators to list", async () => {
    await expect(suggestionsRouter.createCaller(context([])).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(suggestionsRouter.createCaller(context(["*"])).list()).resolves.toEqual([]);
  });
});
