/**
 * Public surface of the permissions module.
 *
 * Import via:
 *   import {
 *     PermissionProvider,
 *     ResolvedPermissionProvider,
 *     usePermissions,
 *     useRole,
 *     usePermissionState,
 *     Can,
 *     type PermissionState,
 *   } from "@crm-fran/ui/permissions";
 */

export {
  PermissionProvider,
  ResolvedPermissionProvider,
  usePermissionState,
  usePermissions,
  useRole,
} from "./auth-context";
export type { PermissionState } from "./auth-context";

export { Can } from "./can";
