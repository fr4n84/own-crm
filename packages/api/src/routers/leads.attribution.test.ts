import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { leadsRouter, updateAcquisitionAttributionInput } from "./leads";

describe("lead acquisition attribution router", () => {
  const input = {
    leadId: "lead-1",
    source: "Meta",
    campaign: "Agosto",
    ad: "Vídeo 1",
    creative: "UGC",
    acquisitionAngle: "Libertad",
  };

  it("validates normalized bounded current attribution", () => {
    expect(updateAcquisitionAttributionInput.parse(input)).toEqual(input);
    expect(() => updateAcquisitionAttributionInput.parse({ ...input, ad: "x".repeat(201) })).toThrow();
  });

  it("forbids ordinary lead writers from mutating attribution", async () => {
    const caller = leadsRouter.createCaller({
      session: { user: { id: "caller", roleId: "caller", name: "Caller", email: "caller@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } },
      role: { id: "caller", name: "Caller", permissions: ["leads:write"] },
      permissions: ["leads:write"],
    } as Context);

    await expect(caller.updateAcquisitionAttribution(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
