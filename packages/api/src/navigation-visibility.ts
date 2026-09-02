import type { Permission } from "@crm-fran/db/schema/auth";

export const NAVIGATION_MODULE_IDS = [
  "dashboard",
  "decision-center",
  "next-best-action",
  "commercial-observatory",
  "profitability",
  "general-leads",
  "vsl-leads",
  "personal-leads",
  "whatsapp",
  "closer-sales",
  "alerts",
  "agendas",
  "calendar",
  "messages",
  "personal-statistics",
  "users-access",
] as const;

export type NavigationModuleId = (typeof NAVIGATION_MODULE_IDS)[number];

export const NAVIGATION_MODULE_CATALOG = [
  { id: "dashboard" },
  { id: "decision-center", globalOnly: true },
  { id: "next-best-action", requiredPermission: "alerts:read" },
  { id: "commercial-observatory", requiredPermission: "leads:read" },
  { id: "profitability", globalOnly: true },
  { id: "general-leads", requiredPermission: "leads:read" },
  { id: "vsl-leads", requiredPermission: "leads:read" },
  { id: "personal-leads", requiredPermission: "leads:read" },
  { id: "whatsapp", requiredPermission: "leads:read" },
  { id: "closer-sales", requiredPermission: "sales:read" },
  { id: "alerts", requiredPermission: "alerts:read" },
  { id: "agendas", requiredPermission: "leads:read" },
  { id: "calendar", requiredPermission: "leads:read" },
  { id: "messages" },
  { id: "personal-statistics", requiredPermission: "leads:read" },
  { id: "users-access", globalOnly: true },
] as const;

export type NavigationVisibilityEntry = {
  moduleId: string;
  roleIds: readonly string[];
};

export class NavigationVisibilityValidationError extends Error {
  constructor(public readonly reason: "invalid_module" | "invalid_role" | "duplicate_module" | "incomplete_catalog" | "privilege_escalation" | "admin_lockout", message: string) {
    super(message);
  }
}

function hasPermission(permissions: readonly Permission[], required: Permission) {
  if (permissions.includes("*") || permissions.includes(required)) return true;
  const [domain] = required.split(":");
  return Boolean(domain && permissions.includes(`${domain}:*` as Permission));
}

export function roleCanAccessNavigationModule(
  permissions: readonly Permission[],
  moduleId: NavigationModuleId,
) {
  const module = NAVIGATION_MODULE_CATALOG.find((candidate) => candidate.id === moduleId)!;
  if ("globalOnly" in module && module.globalOnly) return permissions.includes("*");
  return "requiredPermission" in module
    ? hasPermission(permissions, module.requiredPermission)
    : true;
}

export function validateNavigationVisibility(
  entries: readonly NavigationVisibilityEntry[],
  roles: readonly { id: string; permissions: readonly Permission[] }[],
) {
  if (entries.length !== NAVIGATION_MODULE_IDS.length) {
    throw new NavigationVisibilityValidationError("incomplete_catalog", "Debe enviarse el catálogo completo de módulos");
  }
  const knownRoles = new Map(roles.map((role) => [role.id, role]));
  const seen = new Set<string>();
  const result: Record<NavigationModuleId, string[]> = Object.create(null) as Record<NavigationModuleId, string[]>;

  for (const entry of entries) {
    if (!NAVIGATION_MODULE_IDS.includes(entry.moduleId as NavigationModuleId)) {
      throw new NavigationVisibilityValidationError("invalid_module", "El módulo no pertenece al catálogo permitido");
    }
    if (seen.has(entry.moduleId)) {
      throw new NavigationVisibilityValidationError("duplicate_module", "El módulo está duplicado");
    }
    seen.add(entry.moduleId);
    const moduleId = entry.moduleId as NavigationModuleId;
    const roleIds = [...new Set(entry.roleIds)].sort();
    for (const roleId of roleIds) {
      const role = knownRoles.get(roleId);
      if (!role) throw new NavigationVisibilityValidationError("invalid_role", "El rol no existe");
      if (!roleCanAccessNavigationModule(role.permissions, moduleId)) {
        throw new NavigationVisibilityValidationError("privilege_escalation", "La visibilidad nunca puede ampliar los permisos reales");
      }
    }
    result[moduleId] = roleIds;
  }

  const wildcardRoleIds = roles.filter((role) => role.permissions.includes("*")).map((role) => role.id);
  if (wildcardRoleIds.some((roleId) => !result["users-access"].includes(roleId))) {
    throw new NavigationVisibilityValidationError("admin_lockout", "Usuarios y accesos debe seguir visible para todos los administradores globales");
  }
  return result;
}
