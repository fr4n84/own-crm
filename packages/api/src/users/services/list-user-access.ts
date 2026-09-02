import { asc, db, eq } from "@crm-fran/db";
import { roles, user } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";

const KNOWN_PERMISSIONS = new Set<Permission>([
  "leads:read", "leads:write", "leads:delete", "leads:*",
  "reports:read",
  "users:*", "users:read", "users:write", "users:delete", "users:create", "users:update",
  "profile:read", "profile:write", "profile:*",
  "alerts:read", "alerts:write", "alerts:delete", "alerts:*",
  "settings:read", "settings:write",
  "*",
]);

export type UserAccessStatus = "verified" | "pending";

export type UserAccessFilters = {
  search?: string;
  roleId?: string;
  status?: UserAccessStatus;
};

export function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((permission): permission is Permission =>
    typeof permission === "string" && KNOWN_PERMISSIONS.has(permission as Permission),
  ))].sort((left, right) => left.localeCompare(right));
}

export async function listUserAccess(filters: UserAccessFilters) {
  const [userRows, roleRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        roleId: user.roleId,
        roleName: roles.name,
        rolePermissions: roles.permissions,
      })
      .from(user)
      .innerJoin(roles, eq(user.roleId, roles.id))
      .orderBy(asc(user.name), asc(user.email)),
    db
      .select({ id: roles.id, name: roles.name, permissions: roles.permissions })
      .from(roles)
      .orderBy(asc(roles.name)),
  ]);

  const search = filters.search?.trim().toLocaleLowerCase("es") ?? "";
  const users = userRows
    .filter((row) => !filters.roleId || row.roleId === filters.roleId)
    .filter((row) => !filters.status || (row.emailVerified ? "verified" : "pending") === filters.status)
    .filter((row) => !search || `${row.name}\n${row.email}`.toLocaleLowerCase("es").includes(search))
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      status: (row.emailVerified ? "verified" : "pending") as UserAccessStatus,
      roles: [{ id: row.roleId, name: row.roleName }],
      effectivePermissions: normalizePermissions(row.rolePermissions),
    }));

  const userCountByRole = new Map<string, number>();
  for (const row of userRows) userCountByRole.set(row.roleId, (userCountByRole.get(row.roleId) ?? 0) + 1);

  return {
    users,
    roles: roleRows.map((role) => ({
      id: role.id,
      name: role.name,
      effectivePermissions: normalizePermissions(role.permissions),
      userCount: userCountByRole.get(role.id) ?? 0,
      users: userRows
        .filter((row) => row.roleId === role.id)
        .map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          status: (row.emailVerified ? "verified" : "pending") as UserAccessStatus,
        })),
    })),
  };
}
