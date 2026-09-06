import { describe, expect, it } from "vitest";

import { assertActiveAccount } from "./trpc/account-access";

describe("account access defense in depth", () => {
  for (const status of ["pending", "disabled"] as const) {
    it(`blocks ${status} sessions`, () => {
      expect(() => assertActiveAccount({ accessStatus: status })).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    });
  }
  it("allows active and pre-migration test-session shapes", () => {
    expect(() => assertActiveAccount({ accessStatus: "active" })).not.toThrow();
    expect(() => assertActiveAccount({})).not.toThrow();
  });
});
