import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { decisionCenterRouter, decisionTransitionInput } from "./decision-center";

describe("decision center router", () => {
  it("validates lifecycle commands", () => {
    expect(decisionTransitionInput.parse({ decisionId: "d1", action: "approve" })).toEqual({
      decisionId: "d1",
      action: "approve",
    });
    expect(() => decisionTransitionInput.parse({ decisionId: "d1", action: "delete" })).toThrow();
  });

  it("does not expose financial or team-wide decisions to ordinary users", async () => {
    const caller = decisionCenterRouter.createCaller({
      session: { user: { id: "caller", roleId: "caller", name: "Caller", email: "caller@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } },
      role: { id: "caller", name: "Caller", permissions: ["leads:read"] },
      permissions: ["leads:read"],
    } as Context);

    await expect(caller.weekly()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
