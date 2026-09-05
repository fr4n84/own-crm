import { describe, expect, it } from "vitest";

import { canAccessAlertRecord } from "./alert-access-policy";

describe("shared alert access", () => {
  const alert = {
    targetUserId: "closer-1",
    lead: { callerId: "caller-1", closerId: "closer-1" },
  };

  it("shares one alert with its target, caller, closer, and global admin", () => {
    expect(canAccessAlertRecord(alert, "closer-1", ["alerts:*"])).toBe(true);
    expect(canAccessAlertRecord(alert, "caller-1", ["users:read", "alerts:*"])).toBe(true);
    expect(canAccessAlertRecord(alert, "admin-1", ["*"])).toBe(true);
  });

  it("does not treat domain wildcards or users:read as unrelated-record access", () => {
    expect(canAccessAlertRecord(alert, "other-1", ["alerts:*"])).toBe(false);
    expect(canAccessAlertRecord(alert, "other-1", ["users:read"])).toBe(false);
  });
});
