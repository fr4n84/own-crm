import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { askCrmInput, askCrmRouter } from "./ask-crm";

describe("Pregúntale al CRM router", () => {
  it("has two admin-only read queries and a strict bounded input", () => {
    expect(Object.keys(askCrmRouter._def.procedures)).toEqual(["catalog", "ask"]);
    expect(() => askCrmInput.parse({ question: "ab", overrides: {} })).toThrow();
    expect(() => askCrmInput.parse({ question: "Dame anomalías", arbitrary: true })).toThrow();
    expect(() => askCrmInput.parse({ question: "Dame anomalías", overrides: { currency: "eur" } })).toThrow();
    expect(() => askCrmInput.parse({ question: "Dame anomalías", overrides: { currency: "XYZ" } })).toThrow();
    expect(askCrmInput.parse({ question: "Dame anomalías", overrides: { currency: "EUR" } }).overrides?.currency).toBe("EUR");
  });

  it("rejects a non-admin before resolving data", async () => {
    const context = {
      session: {
        session: {
          id: "session",
          userId: "caller",
          token: "token",
          expiresAt: new Date("2026-08-28T00:00:00.000Z"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        user: {
          id: "caller",
          roleId: "caller",
          name: "Caller",
          email: "caller@example.com",
          emailVerified: true,
          leadActive: "active",
          scoring: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      role: { id: "caller", name: "Caller", permissions: ["leads:read"] },
      permissions: ["leads:read"],
    } satisfies Context;
    const caller = askCrmRouter.createCaller(context);

    await expect(caller.catalog()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
