export type NavigationPermission =
  | "leads:read"
  | "alerts:read"
  | "sales:read"
  | "*";

export type PrimaryNavigationItem = {
  id:
    | "dashboard"
    | "decision-center"
    | "next-best-action"
    | "commercial-observatory"
    | "profitability"
    | "general-leads"
    | "vsl-leads"
    | "personal-leads"
    | "whatsapp"
    | "closer-sales"
    | "alerts"
    | "agendas"
    | "calendar"
    | "messages"
    | "personal-statistics"
    | "users-access";
  title: string;
  url: string;
  requiredPermission?: NavigationPermission;
  globalOnly?: boolean;
};

/**
 * Single navigation policy consumed by both the sidebar and the role-access
 * directory. This is a discoverability policy only; the API remains the
 * security authority for every operation.
 */
export const PRIMARY_NAVIGATION_ITEMS = [
  { id: "dashboard", title: "Dashboard", url: "/" },
  { id: "decision-center", title: "Centro de decisiones", url: "/centro-de-decisiones", globalOnly: true },
  { id: "next-best-action", title: "Próxima mejor acción", url: "/next-best-action", requiredPermission: "alerts:read" },
  { id: "commercial-observatory", title: "Observatorio comercial", url: "/observatorio-comercial", requiredPermission: "leads:read" },
  { id: "profitability", title: "Rentabilidad y verdad económica", url: "/rentabilidad", globalOnly: true },
  { id: "general-leads", title: "Leads generales", url: "/leads-generales", requiredPermission: "leads:read" },
  { id: "vsl-leads", title: "Leads VSL", url: "/vsl-leads", requiredPermission: "leads:read" },
  { id: "personal-leads", title: "Leads personales", url: "/leads-personales", requiredPermission: "leads:read" },
  { id: "whatsapp", title: "WhatsApp", url: "/whatsapp", requiredPermission: "leads:read" },
  { id: "closer-sales", title: "Ventas closer", url: "/ventas-closer", requiredPermission: "sales:read" },
  { id: "alerts", title: "Alertas", url: "/alerts", requiredPermission: "alerts:read" },
  { id: "agendas", title: "Agendas", url: "/agendas", requiredPermission: "leads:read" },
  { id: "calendar", title: "Calendario", url: "/calendar", requiredPermission: "leads:read" },
  { id: "messages", title: "Mensajes", url: "/messages" },
  { id: "personal-statistics", title: "Estadísticas personales", url: "/estadisticas-personales", requiredPermission: "leads:read" },
  { id: "users-access", title: "Usuarios y accesos", url: "/usuarios-accesos", globalOnly: true },
] as const satisfies readonly PrimaryNavigationItem[];

function hasPermission(permissions: readonly string[], requiredPermission: NavigationPermission) {
  if (permissions.includes("*")) return true;
  if (permissions.includes(requiredPermission)) return true;
  const [domain] = requiredPermission.split(":");
  return Boolean(domain && permissions.includes(`${domain}:*`));
}

export function canAccessNavigationItem(
  item: { id?: string; globalOnly?: boolean; requiredPermission?: NavigationPermission },
  permissions: readonly string[],
) {
  if (item.globalOnly && !permissions.includes("*")) return false;
  return item.requiredPermission ? hasPermission(permissions, item.requiredPermission) : true;
}

export function navigationModulesForPermissions(permissions: readonly string[]) {
  return PRIMARY_NAVIGATION_ITEMS.filter((item) => canAccessNavigationItem(item, permissions));
}

export type NavigationVisibilityConfiguration = {
  roleIdsByModule: Partial<Record<PrimaryNavigationItem["id"], readonly string[]>>;
};

export function canViewConfiguredNavigationItem(
  item: PrimaryNavigationItem,
  roleId: string | null | undefined,
  permissions: readonly string[],
  configuration?: NavigationVisibilityConfiguration,
) {
  if (!canAccessNavigationItem(item, permissions)) return false;
  if (item.id === "users-access" && permissions.includes("*")) return true;
  const configuredRoles = configuration?.roleIdsByModule[item.id];
  return configuredRoles === undefined || Boolean(roleId && configuredRoles.includes(roleId));
}
