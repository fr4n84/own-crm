"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Permission, ResolvedRole } from "@crm-fran/db/schema/auth";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Full state exposed by the permission context.
 *
 * - `role`       : the user's resolved role (id + name + permission list from DB), or null if not authenticated.
 * - `permissions`: flat list of effective permissions for the current user.
 * - `isLoaded`   : true once the first resolution attempt (success or failure) has completed.
 * - `isLoading`  : true while a resolution is in flight.
 * - `error`      : non-null if the last resolution attempt threw.
 */
export type PermissionState = {
  role: ResolvedRole | null;
  permissions: Permission[];
  isLoaded: boolean;
  isLoading: boolean;
  error: Error | null;
};

// ── Default state (used when a hook runs outside a PermissionProvider) ───────

/**
 * Intentional design: when consumed without a provider, hooks return a valid
 * empty state rather than throwing. The CLIENT is never the source of truth —
 * the server enforces permissions regardless. Empty permissions here just
 * means "we don't know what you can do, so render nothing" (defensive UI).
 */
const DEFAULT_STATE: PermissionState = {
  role: null,
  permissions: [],
  isLoaded: false,
  isLoading: false,
  error: null,
};

// ── Context ──────────────────────────────────────────────────────────────────

const PermissionContext = createContext<PermissionState>(DEFAULT_STATE);

// ── Provider ─────────────────────────────────────────────────────────────────

/**
 * `PermissionProvider` wraps the React tree and resolves the current user's
 * role + permissions on mount, exposing them via the hooks below.
 *
 * The provider is intentionally decoupled from tRPC: it accepts a
 * `resolvePermissions` callback instead of importing the client directly.
 * This keeps the UI package free of network-layer concerns and makes the
 * provider trivial to mock in tests or wire to a different transport.
 *
 * The actual tRPC integration lives in `apps/web/src/components/providers.tsx`
 * (see T6.6) where the callback is constructed.
 */
export function PermissionProvider({
  children,
  resolvePermissions,
}: {
  children: React.ReactNode;
  resolvePermissions: () => Promise<{
    role: ResolvedRole | null;
    permissions: Permission[];
  }>;
}) {
  const [state, setState] = useState<PermissionState>({
    role: null,
    permissions: [],
    isLoaded: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // `cancelled` flag prevents setState on an unmounted component (and
    // avoids writing stale results from a slow first call into a second
    // call that already finished). Classic React race-condition guard.
    let cancelled = false;

    async function load() {
      try {
        const result = await resolvePermissions();
        if (cancelled) return;
        setState({
          role: result.role,
          permissions: result.permissions,
          isLoaded: true,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          role: null,
          permissions: [],
          isLoaded: true,
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [resolvePermissions]);

  return (
    <PermissionContext.Provider value={state}>
      {children}
    </PermissionContext.Provider>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Full state. Use when you need loading/error info (e.g. spinners, error UI). */
export function usePermissionState(): PermissionState {
  return useContext(PermissionContext);
}

/** Just the permission list. The common case for `<Can>` and similar gates. */
export function usePermissions(): Permission[] {
  return useContext(PermissionContext).permissions;
}

/** Just the role. Useful for role-aware UI (e.g. "Admin tools" section). */
export function useRole(): ResolvedRole | null {
  return useContext(PermissionContext).role;
}
