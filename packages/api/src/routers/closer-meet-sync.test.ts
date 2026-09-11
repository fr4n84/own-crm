import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  createWorkspace: vi.fn(),
  getLeadContext: vi.fn(),
  listByLead: vi.fn(),
  run: vi.fn(),
}));
vi.mock("../closer-meet/repository", () => ({ closerMeetRepository: { getLeadContext: mocks.getLeadContext, listByLead: mocks.listByLead } }));
vi.mock("../google-workspace/runtime", () => ({ createGoogleWorkspaceClientFromEnv: mocks.createWorkspace }));
vi.mock("../closer-meet/recording-sync-runtime", () => ({
  createCloserMeetRecordingSyncRuntime: mocks.createRuntime,
}));

import { closerMeetRouter } from "./closer-meet";

const date = new Date("2026-09-20T12:00:00.000Z");
function context(permissions: Context["permissions"]): Context {
  return {
    session: {
      session: { id: "s", token: "t", userId: "u", expiresAt: date, createdAt: date, updatedAt: date },
      user: { id: "u", name: "User", email: "u@example.com", emailVerified: true, accessStatus: "active", createdAt: date, updatedAt: date, roleId: "role-admin", leadActive: "", scoring: 0 },
    },
    role: { id: "role-admin", name: "Admin", permissions },
    permissions,
  };
}

describe("Closer Meet recording sync boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRuntime.mockReturnValue({ run: mocks.run });
    mocks.run.mockResolvedValue({ synced: 1, errors: [] });
    mocks.createWorkspace.mockReturnValue(undefined);
    mocks.getLeadContext.mockResolvedValue({ leadId: "lead-1", closerId: "u", closerEmail: "u@example.com", contactEmail: null });
    mocks.listByLead.mockResolvedValue([{ id: "meeting-1", hasTranscript: true }]);
  });

  it("lists stored recording and transcript availability without requiring live Workspace configuration", async () => {
    await expect(closerMeetRouter.createCaller(context(["sales:read"])).list({ leadId: "lead-1" })).resolves.toEqual([{ id: "meeting-1", hasTranscript: true }]);
    expect(mocks.createWorkspace).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin callers before starting sync", async () => {
    await expect(closerMeetRouter.createCaller(context(["sales:write"])).runRecordingSync()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs a fixed server-owned sync batch for an administrator", async () => {
    await expect(closerMeetRouter.createCaller(context(["*"])).runRecordingSync()).resolves.toEqual({ synced: 1, errors: [] });
    expect(mocks.run).toHaveBeenCalledWith(expect.any(Date));
  });
});