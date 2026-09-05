import { describe, expect, it } from "vitest";

import {
  canAccessNavigationItem,
  canViewConfiguredNavigationItem,
  navigationModulesForPermissions,
  PRIMARY_NAVIGATION_ITEMS,
  presentNavigationForRole,
} from "./navigation-policy";

describe("navigation policy", () => {
  it("keeps wildcard-only modules hidden from ordinary roles", () => {
    const usersAccess = PRIMARY_NAVIGATION_ITEMS.find((item) => item.id === "users-access");

    expect(usersAccess).toBeDefined();
    expect(canAccessNavigationItem(usersAccess!, ["users:read"])).toBe(false);
    expect(canAccessNavigationItem(usersAccess!, ["*"])).toBe(true);
  });

  it("resolves domain wildcards exactly like the permission gate", () => {
    const leads = PRIMARY_NAVIGATION_ITEMS.find((item) => item.id === "general-leads");

    expect(canAccessNavigationItem(leads!, ["leads:*"])).toBe(true);
    expect(canAccessNavigationItem(leads!, ["alerts:*"])).toBe(false);
  });

  it("derives role modules from the same catalog rendered by the sidebar", () => {
    const modules = navigationModulesForPermissions(["alerts:read"]);

    expect(modules.map((module) => module.id)).toContain("next-best-action");
    expect(modules.map((module) => module.id)).not.toContain("users-access");
    expect(modules.every((module) => PRIMARY_NAVIGATION_ITEMS.includes(module))).toBe(true);
  });

  it("intersects configured visibility with real permissions and preserves admin recovery", () => {
    const leads = PRIMARY_NAVIGATION_ITEMS.find((item) => item.id === "general-leads")!;
    const usersAccess = PRIMARY_NAVIGATION_ITEMS.find((item) => item.id === "users-access")!;
    const configuration = { roleIdsByModule: { "general-leads": ["role-caller"], "users-access": [] } };

    expect(canViewConfiguredNavigationItem(leads, "role-caller", ["leads:read"], configuration)).toBe(true);
    expect(canViewConfiguredNavigationItem(leads, "role-closer", ["leads:read"], configuration)).toBe(false);
    expect(canViewConfiguredNavigationItem(leads, "role-caller", ["alerts:read"], configuration)).toBe(false);
    expect(canViewConfiguredNavigationItem(usersAccess, "role-admin", ["*"], configuration)).toBe(true);
  });
});

it("simplifies the exact closer navigation without changing other roles", () => {
  const visible = PRIMARY_NAVIGATION_ITEMS.filter((item) => ["general-leads", "personal-leads", "whatsapp"].includes(item.id));
  expect(presentNavigationForRole(visible, "role-closer").map(({ id, title }) => ({ id, title }))).toEqual([{ id: "personal-leads", title: "Leads" }]);
  expect(presentNavigationForRole(visible, "role-caller-closer").map(({ id }) => id)).toEqual(["general-leads", "personal-leads", "whatsapp"]);
});

it("hides caller and closer observatory by default but permits explicit grants",()=>{const item=PRIMARY_NAVIGATION_ITEMS.find(item=>item.id==="commercial-observatory")!;expect(canViewConfiguredNavigationItem(item,"role-caller",["leads:read"])).toBe(false);expect(canViewConfiguredNavigationItem(item,"role-closer",["leads:read"])).toBe(false);expect(canViewConfiguredNavigationItem(item,"role-caller-closer",["leads:read"])).toBe(true);expect(canViewConfiguredNavigationItem(item,"role-caller",["leads:read"],{roleIdsByModule:{"commercial-observatory":["role-caller"]}})).toBe(true);});
