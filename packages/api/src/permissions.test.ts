import { describe, expect, it } from "vitest";

import { hasPermission } from "./permissions";

describe("hasPermission", () => {
  describe("wildcard admin", () => {
    it("grants access when user has the global wildcard '*'", () => {
      expect(hasPermission(["*"], ["users:create"])).toBe(true);
    });

    it("grants access to any required permission when user has '*'", () => {
      expect(hasPermission(["*"], ["leads:read", "alerts:write", "*"])).toBe(
        true,
      );
    });

    it("grants access even when required list is empty if user has '*'", () => {
      expect(hasPermission(["*"], [])).toBe(true);
    });
  });

  describe("domain wildcard", () => {
    it("grants access to any action in a domain when user has 'domain:*'", () => {
      expect(hasPermission(["users:*"], ["users:create"])).toBe(true);
    });

    it("grants access to multiple actions in the same domain", () => {
      expect(hasPermission(["users:*"], ["users:read", "users:delete"])).toBe(
        true,
      );
    });

    it("does NOT grant access to other domains", () => {
      expect(hasPermission(["users:*"], ["leads:read"])).toBe(false);
    });
  });

  describe("exact match", () => {
    it("grants access when user has the exact required permission", () => {
      expect(hasPermission(["users:read"], ["users:read"])).toBe(true);
    });

    it("grants access when user has all required permissions", () => {
      expect(
        hasPermission(["users:read", "users:create"], ["users:read"]),
      ).toBe(true);
    });

    it("denies access when user is missing one required permission", () => {
      expect(
        hasPermission(["users:read"], ["users:read", "users:create"]),
      ).toBe(false);
    });
  });

  describe("deny cases", () => {
    it("denies access when user has no permissions", () => {
      expect(hasPermission([], ["users:read"])).toBe(false);
    });

    it("denies access when user has different permissions", () => {
      expect(hasPermission(["leads:read"], ["users:read"])).toBe(false);
    });

    it("denies access when user has only a sibling action in same domain", () => {
      // hasPermission is exact within the same domain, not partial
      expect(hasPermission(["users:read"], ["users:create"])).toBe(false);
    });
  });

  describe("multiple required permissions (AND logic)", () => {
    it("requires ALL permissions to be present (every, not some)", () => {
      expect(
        hasPermission(["users:read"], ["users:read", "users:create"]),
      ).toBe(false);
    });

    it("grants access only when ALL required are present", () => {
      expect(
        hasPermission(
          ["users:read", "users:create"],
          ["users:read", "users:create"],
        ),
      ).toBe(true);
    });
  });
});
