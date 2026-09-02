import { describe, expect, it } from "vitest";

import {
  NAVIGATION_MODULE_IDS,
  NavigationVisibilityValidationError,
  roleCanAccessNavigationModule,
  validateNavigationVisibility,
} from "./navigation-visibility";

const roles = [
  { id: "role-caller", permissions: ["leads:*", "alerts:read"] as const },
  { id: "role-closer", permissions: ["leads:read", "alerts:*", "sales:*"] as const },
  { id: "role-caller-closer", permissions: ["leads:*", "alerts:*", "sales:*"] as const },
  { id: "role-admin", permissions: ["*"] as const },
];

function fullEntries() {
  return NAVIGATION_MODULE_IDS.map((moduleId) => ({
    moduleId,
    roleIds: roles.filter((role) => roleCanAccessNavigationModule(role.permissions, moduleId)).map((role) => role.id),
  }));
}

describe("navigation visibility validation", () => {
  it("accepts only a complete closed module and role catalog", () => {
    expect(validateNavigationVisibility(fullEntries(), roles)["general-leads"]).toEqual(["role-admin", "role-caller", "role-caller-closer", "role-closer"]);
    expect(() => validateNavigationVisibility(fullEntries().slice(1), roles)).toThrowError(NavigationVisibilityValidationError);
    expect(() => validateNavigationVisibility([...fullEntries().slice(0, -1), { moduleId: "arbitrary-route", roleIds: [] }], roles)).toThrow("catálogo");
    expect(() => validateNavigationVisibility(fullEntries().map((entry) => entry.moduleId === "dashboard" ? { ...entry, roleIds: [...entry.roleIds, "missing-role"] } : entry), roles)).toThrow("rol no existe");
  });

  it("rejects visibility that would imply access a role does not have", () => {
    const entries = fullEntries().map((entry) => entry.moduleId === "profitability" ? { ...entry, roleIds: [...entry.roleIds, "role-caller"] } : entry);
    expect(() => validateNavigationVisibility(entries, roles)).toThrow("nunca puede ampliar");
  });

  it("prevents every wildcard administrator from losing the recovery module", () => {
    const entries = fullEntries().map((entry) => entry.moduleId === "users-access" ? { ...entry, roleIds: [] } : entry);
    expect(() => validateNavigationVisibility(entries, roles)).toThrow("todos los administradores");
  });

  it("makes closer sales visible only to roles with sales access", () => {
    expect(validateNavigationVisibility(fullEntries(), roles)["closer-sales"]).toEqual([
      "role-admin",
      "role-caller-closer",
      "role-closer",
    ]);
  });

  it("makes the WhatsApp queue visible to every role that can read leads", () => {
    expect(validateNavigationVisibility(fullEntries(), roles).whatsapp).toEqual([
      "role-admin",
      "role-caller",
      "role-caller-closer",
      "role-closer",
    ]);
  });
});
