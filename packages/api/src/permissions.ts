import { PERMISSION_VALUES, type Permission } from "@crm-fran/db/schema/auth";

const KNOWN_PERMISSIONS = new Set<Permission>(PERMISSION_VALUES);

export function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((permission): permission is Permission =>
    typeof permission === "string" && KNOWN_PERMISSIONS.has(permission as Permission),
  ))].sort((left, right) => left.localeCompare(right));
}

export const hasPermission = (
  permissions: Permission[],
  requiredPermissions: Permission[],
) => {
  if (permissions.includes("*")) {
    return true;
  }

  return requiredPermissions.every((p) => {
    const domain = p.split(":")[0];
    
    return (
      permissions.includes(p) ||
      permissions.includes(`${domain}:*` as Permission)
    );
  });
};
