import { describe, expect, it } from "vitest";

import { canAccessNavigationItem, PRIMARY_NAVIGATION_ITEMS } from "./navigation-policy";

describe("email marketing navigation visibility", () => {
  it("is discoverable only to global administrators", () => {
    const item = PRIMARY_NAVIGATION_ITEMS.find((candidate) => candidate.id === "email-marketing");
    expect(item).toBeDefined();
    expect(canAccessNavigationItem(item!, ["leads:read"])).toBe(false);
    expect(canAccessNavigationItem(item!, ["*"])).toBe(true);
  });
});
