import { and, db, eq } from "@crm-fran/db";
import { navigationVisibilitySettings, roles } from "@crm-fran/db/schema/index";
import type { Permission } from "@crm-fran/db/schema/auth";
import { TRPCError } from "@trpc/server";

import {
  NAVIGATION_MODULE_IDS,
  NavigationVisibilityValidationError,
  validateNavigationVisibility,
  type NavigationModuleId,
  type NavigationVisibilityEntry,
} from "../../navigation-visibility";
import { normalizePermissions } from "./list-user-access";

export type NavigationVisibilitySnapshot = {
  configured: boolean;
  version: number;
  roleIdsByModule: Partial<Record<NavigationModuleId, string[]>>;
};

function isUndefinedTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "42P01" || isUndefinedTable(candidate.cause);
}

function sanitizedConfiguration(value: unknown, knownRoleIds: ReadonlySet<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Partial<Record<NavigationModuleId, string[]>> = {};
  for (const moduleId of NAVIGATION_MODULE_IDS) {
    const roleIds = source[moduleId];
    if (!Array.isArray(roleIds)) continue;
    result[moduleId] = [...new Set(roleIds.filter((roleId): roleId is string => typeof roleId === "string" && knownRoleIds.has(roleId)))].sort();
  }
  return result;
}

export async function getNavigationVisibility(): Promise<NavigationVisibilitySnapshot> {
  try {
    const [settingsRows, roleRows] = await Promise.all([
      db.select({ version: navigationVisibilitySettings.version, roleIdsByModule: navigationVisibilitySettings.roleIdsByModule }).from(navigationVisibilitySettings).where(eq(navigationVisibilitySettings.id, "primary")).limit(1),
      db.select({ id: roles.id }).from(roles),
    ]);
    const settings = settingsRows[0];
    if (!settings) return { configured: false, version: 0, roleIdsByModule: {} };
    return {
      configured: true,
      version: settings.version,
      roleIdsByModule: sanitizedConfiguration(settings.roleIdsByModule, new Set(roleRows.map((role) => role.id))),
    };
  } catch (error) {
    if (isUndefinedTable(error)) return { configured: false, version: 0, roleIdsByModule: {} };
    throw error;
  }
}

export async function updateNavigationVisibility(input: {
  actorId: string;
  expectedVersion: number;
  entries: readonly NavigationVisibilityEntry[];
}): Promise<NavigationVisibilitySnapshot> {
  try {
    return await db.transaction(async (transaction) => {
      const roleRows = await transaction.select({ id: roles.id, permissions: roles.permissions }).from(roles);
      let roleIdsByModule: Record<NavigationModuleId, string[]>;
      try {
        roleIdsByModule = validateNavigationVisibility(
          input.entries,
          roleRows.map((role) => ({ id: role.id, permissions: normalizePermissions(role.permissions) as Permission[] })),
        );
      } catch (error) {
        if (error instanceof NavigationVisibilityValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
        }
        throw error;
      }

      if (input.expectedVersion === 0) {
        const [created] = await transaction
          .insert(navigationVisibilitySettings)
          .values({ id: "primary", roleIdsByModule, version: 1, updatedById: input.actorId })
          .onConflictDoNothing()
          .returning({ version: navigationVisibilitySettings.version });
        if (!created) throw new TRPCError({ code: "CONFLICT", message: "La configuración cambió mientras la editabas" });
        return { configured: true, version: created.version, roleIdsByModule };
      }

      const [updated] = await transaction
        .update(navigationVisibilitySettings)
        .set({ roleIdsByModule, version: input.expectedVersion + 1, updatedById: input.actorId, updatedAt: new Date() })
        .where(and(eq(navigationVisibilitySettings.id, "primary"), eq(navigationVisibilitySettings.version, input.expectedVersion)))
        .returning({ version: navigationVisibilitySettings.version });
      if (!updated) throw new TRPCError({ code: "CONFLICT", message: "La configuración cambió mientras la editabas" });
      return { configured: true, version: updated.version, roleIdsByModule };
    });
  } catch (error) {
    if (isUndefinedTable(error)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La configuración de navegación todavía no está disponible en la base de datos" });
    }
    throw error;
  }
}
