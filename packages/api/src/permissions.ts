import type { Permission } from "@crm-fran/db/schema/auth";

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

