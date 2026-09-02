import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { commercialObservatoryInput, commercialObservatoryRouter } from "./commercial-observatory";

describe("commercial observatory router", () => {
  it("rejects future and inverted ranges", () => {
    expect(() => commercialObservatoryInput.parse({ from: "2026-02-01", to: "2026-01-01" })).toThrow();
    expect(() => commercialObservatoryInput.parse({ from: "2026-01-01T12:34:56Z", to: "2026-02-01T12:34:56Z" })).toThrow();
    const future = new Date(Date.now() + 172_800_000).toISOString().slice(0, 10);
    expect(() => commercialObservatoryInput.parse({ from: "2026-01-01", to: future })).toThrow();
  });

  it("exposes one read-only overview procedure and denies non-admin users before loading data", async () => {
    expect(commercialObservatoryRouter._def.procedures).toMatchObject({ overview: expect.anything() });
    expect(Object.keys(commercialObservatoryRouter._def.procedures)).toEqual(["overview"]);
    const caller = commercialObservatoryRouter.createCaller({
      session: { user: { id: "caller", roleId: "caller", name: "Caller", email: "caller@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } },
      role: { id: "caller", name: "Caller", permissions: ["leads:read"] },
      permissions: ["leads:read"],
    } as Context);
    await expect(caller.overview({ from: "2026-01-01", to: "2026-02-01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
