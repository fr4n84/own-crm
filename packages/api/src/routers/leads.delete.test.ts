import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({ deleteLead: vi.fn() }));

vi.mock("../leads/services/index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../leads/services/index")>()),
  deleteLead: mocks.deleteLead,
}));

import { leadsRouter } from "./leads";

describe("leads.delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hard-deletes through the service and preserves the public response", async () => {
    mocks.deleteLead.mockResolvedValue({ success: true, id: "lead-1" });
    const caller = leadsRouter.createCaller({
      session: {
        user: {
          id: "admin",
          roleId: "admin",
          name: "Admin",
          email: "admin@example.com",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      role: { id: "admin", name: "Admin", permissions: ["leads:delete"] },
      permissions: ["leads:delete"],
    } as Context);

    await expect(caller.delete({ id: "lead-1" })).resolves.toEqual({
      success: true,
      id: "lead-1",
    });
    expect(mocks.deleteLead).toHaveBeenCalledWith("lead-1");
  });
});
