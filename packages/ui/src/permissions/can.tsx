"use client";

import type { Permission } from "@crm-fran/db/schema/auth";

import { usePermissions } from "./auth-context";

/**
 * Conditional render gate based on a single permission.
 *
 * Renders `children` if the current user holds the required permission;
 * otherwise renders `fallback` (default: `null` — nothing).
 *
 * Wildcard rules (mirror of the server-side `hasPermission`):
 *   - user has "*"               → always renders children (super-admin)
 *   - user has "leads:read"      → matches `<Can permission="leads:read">`
 *   - user has "leads:*"         → matches `<Can permission="leads:read">`
 *                                  and any other "leads:*" permission
 *
 * Usage:
 *   <Can permission="leads:create">
 *     <Button>New lead</Button>
 *   </Can>
 *
 *   <Can permission="leads:delete" fallback={<span>Locked</span>}>
 *     <Button>Delete</Button>
 *   </Can>
 *
 * Note: this is a UX hint only. The server (`permittedProcedure`) is the
 * source of truth — never gate security on `<Can>`. If the server says no,
 * the request fails regardless of what the UI shows.
 */
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const permissions = usePermissions();

  // Super-admin wildcard: full access.
  if (permissions.includes("*")) {
    return <>{children}</>;
  }

  // Direct match: user has exactly the required permission.
  if (permissions.includes(permission)) {
    return <>{children}</>;
  }

  // Domain wildcard: user has "<domain>:*" and the requested permission
  // is for that same domain (e.g. user has "leads:*" → matches "leads:read").
  // `split(":")` returns `string[]`; with `noUncheckedIndexedAccess` the
  // first element is `string | undefined`, hence the truthy check.
  // The `as Permission` cast is safe because `domain` is extracted from a
  // value that is already typed as `Permission` — it can only be one of
  // the declared domains (leads, users, profile, alerts, settings, reports).
  const [domain] = permission.split(":");
  if (domain) {
    const domainWildcard = `${domain}:*` as Permission;
    if (permissions.includes(domainWildcard)) {
      return <>{children}</>;
    }
  }

  // No match → render fallback (default: hidden).
  return <>{fallback}</>;
}
