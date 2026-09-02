/**
 * Re-export of `usePermissions` for clean tree-shakeable imports:
 *
 *   import { usePermissions } from "@crm-fran/ui/permissions/use-permissions";
 *
 * vs. the more general:
 *
 *   import { usePermissions } from "@crm-fran/ui/permissions";
 *
 * The dedicated path exists so consumers that only need the hook can pull it
 * in without dragging the whole permissions barrel (which includes
 * `PermissionProvider` and `<Can>`).
 */
export { usePermissions } from "./auth-context";
