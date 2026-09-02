import { describe, expect, it } from "vitest";

import { isNavigationItemActive } from "./nav-main";

describe("navigation active state", () => {
  it("matches exact routes or child path segments, never shared prefixes", () => {
    expect(isNavigationItemActive("/leads", "/leads")).toBe(true);
    expect(isNavigationItemActive("/leads/lead-1", "/leads")).toBe(true);
    expect(isNavigationItemActive("/leads-generales", "/leads")).toBe(false);
    expect(isNavigationItemActive("/", "/")).toBe(true);
    expect(isNavigationItemActive("/dashboard", "/")).toBe(false);
  });
});
