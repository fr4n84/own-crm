# Roles and Permissions — SDD Proposal

> **Change**: `roles-and-permissions`  
> **Status**: Draft for review  
> **Author**: SDD executor  
> **Date**: 2026-06-14

---

## 1. Business Problem

A CRM without role-based access control is flat: every authenticated user sees and can do the same things. This creates problems:

- **Data leakage**: A junior caller (vendedor/operador) can access sensitive deal-close data or admin dashboards.
- **Operational risk**: No guardrails to prevent accidental writes on records the user shouldn't touch.
- **Audit blindspot**: Without roles, there is no structured way to answer "who was supposed to have access to what?"
- **Scaling friction**: Adding new team members (closers, supervisors) requires code changes or manual hacks instead of being a configuration step.

RBAC solves this by attaching a **role** to each user, where the role carries a **permission set** that governs both UI visibility and API access.

---

## 2. Target Users and Situations

| Role | Description | Typical Actions | Urgency |
|---|---|---|---|
| **Caller** (vendedor/operador) | Front-line agent who contacts leads | Read leads, write call notes, update lead status | High — this is the default user type |
| **Closer** | Senior agent who closes deals | Same as caller + can mark deals won/lost, view pricing | Medium — needs escalation path |
| **Admin** (dueño/superadmin) | System owner who manages everything | Full CRUD on all entities, manage users, billing | High — needs total access now |

All three roles exist **today in the business** but are not enforced by the software. Every user currently authenticates but has no access differentiation.

---

## 3. Business Rules

### Role Assignment
1. **Every user has exactly one active role.** The role is required at user creation time.
2. Roles are created and edited by **admins only** (future admin panel). For now, roles are seeded via migration.
3. A user's role can be changed by an admin. Role changes take effect on next request (no session re-login required unless the UI must re-render).

### Role Deletion
4. A role **must not be deletable** while users are assigned to it. This is a database-level and application-level invariant.
5. If a role is deleted after all users are migrated off it, any historical references (audit logs) remain but the role name is resolved at read time.

### Default Role
6. New users who sign up via email/password (without explicit role selection) receive the **caller** role by default. This matches the existing `user.role` default of `"caller"`.

### Permission Model
7. Permissions are stored as a JSON array of strings on each role, e.g., `["leads:read", "leads:write", "users:read"]`.
8. The permission `"*"` (wildcard) grants all permissions for a role (used for admin).
9. Permission granularity follows a `domain:action` convention:
   - `leads:read`, `leads:write`, `leads:delete`
   - `users:read`, `users:write`
   - `settings:read`, `settings:write`
   - `reports:read`
10. Adding a new permission does not require code changes — it is a data operation on the roles table.

### Access Enforcement
11. Both **UI rendering** and **API endpoints** must respect permissions. A hidden button is insufficient; API checks are the authoritative gate.
12. API enforcement happens at the tRPC procedure level via reusable middleware.
13. UI enforcement happens via React components and hooks that consume the session user's role and permissions.

---

## 4. Product Outcome

After this change:

- A **caller** logs in and sees only leads, their call queue, and basic profile settings. The admin nav menu is invisible. API calls to admin-only endpoints return FORBIDDEN.
- A **closer** logs in and sees leads plus a "Close Deal" button on qualifying leads. They can access deal-specific reports.
- An **admin** logs in and sees the full dashboard, user management section, and all settings. They can promote/demote users.
- The UI adapts **on every page load** based on the session user's permissions. No manual role toggling.
- Developers define permissions on new features once (in the router) and the enforcement is automatic.

---

## 5. Current State vs. Target State

### Schema (`packages/db/src/schema/auth.ts`)

| Aspect | Current | Target |
|---|---|---|
| `user.role` (text) | Exists, defaults to `"caller"` | **Remove** — redundant with `roleId` FK |
| `user.roleId` (FK) | Exists, `notNull` | Keep — but add `default(...)` for caller role |
| `roles` table | Exists with `id`, `name`, `permissions` (json), timestamps | Keep — needs seed data |
| `userRelations` | Links user → roles via `roleId` | Already done, keep |
| `rolesRelations` | **Missing** | **Add** — inverse relation roles → users |

### Better Auth (`packages/auth/src/index.ts`)

| Field | Current | Target |
|---|---|---|
| `role` in `additionalFields` | Declared (string, input: true) | **Remove** — will be derived from `roleId` |
| `roleId` in `additionalFields` | **Not declared** | **Add** (string, input: true) |

### Auth API Route (`apps/web/src/app/api/auth/[...all]/route.ts`)

Already functional. No changes needed.

### API Middleware (`packages/api/src/`)

| Aspect | Current | Target |
|---|---|---|
| `protectedProcedure` | Checks session only | Keep — baseline auth |
| Permission middleware | **Does not exist** | **Add** — `requirePermissions(...)` middleware factory |
| Context (`context.ts`) | Returns session + auth | **Add** resolved role + permissions to context |

### UI (`apps/web/src/`)

| Aspect | Current | Target |
|---|---|---|
| Role-aware components | None | **Add** `<Can permission="leads:read">...</Can>` component |
| Role-aware hooks | None | **Add** `usePermissions()` / `useRole()` hooks |
| Middleware (`middleware.ts`) | Does not exist | **Add** — redirect unauthenticated users, optionally enforce route-level role checks |

---

## 6. Detailed Changes

### 6.1 Schema Changes

**File**: `packages/db/src/schema/auth.ts`

1. **Drop `user.role` column** — the role name is derived from the FK join. Migration must backfill data before dropping.
2. **Add default for `user.roleId`** — point to the caller role ID so new users auto-get the caller role.
3. **Add `rolesRelations`** — inverse relation so we can query `role.users`:
   ```ts
   export const rolesRelations = relations(roles, ({ many }) => ({
     users: many(user),
   }));
   ```
4. **Export `rolesRelations`** from the schema index.

### 6.2 Migration Strategy

A Drizzle migration is needed:

1. **Add `roleId` FK default** (if not already set) — point to a seeded "caller" role.
2. **Backfill `roleId`** for existing users where `roleId` is null, based on `user.role` string value (map "caller" → caller role ID, "admin" → admin role ID, etc.).
3. **Drop `user.role` column** after backfill is verified.
4. **Seed initial roles** in the same migration or a separate seed script:

```ts
// Seed data for roles table
const rolesData = [
  {
    id: "role-caller",
    name: "Caller",
    permissions: ["leads:read", "leads:write", "profile:read", "profile:write"],
  },
  {
    id: "role-closer",
    name: "Closer",
    permissions: [
      "leads:read", "leads:write", "leads:delete",
      "deals:read", "deals:write",
      "profile:read", "profile:write",
      "reports:read",
    ],
  },
  {
    id: "role-admin",
    name: "Admin",
    permissions: ["*"],
  },
];
```

### 6.3 Better Auth Configuration

**File**: `packages/auth/src/index.ts`

1. **Remove** `role` from `additionalFields`.
2. **Add** `roleId` to `additionalFields`:
   ```ts
   additionalFields: {
     roleId: {
       type: "string",
       input: true,  // allow setting during sign-up
       required: true,
     },
     leadActive: { type: "string", input: false },
     scoring: { type: "number", input: false },
   },
   ```
3. Better Auth will now store and return `roleId` on the user object in the session.

### 6.4 API Context Enhancement

**File**: `packages/api/src/context.ts`

1. After getting the session, resolve the user's role and permissions:
   ```ts
   export async function createContext(req: NextRequest) {
     const session = await auth.api.getSession({
       headers: req.headers,
     });

     let role: string | null = null;
     let permissions: string[] = [];

     if (session?.user?.roleId) {
       // Fetch role from DB or cache
       const db = createDb();
       const userRole = await db.query.roles.findFirst({
         where: (roles, { eq }) => eq(roles.id, session.user.roleId),
       });
       if (userRole) {
         role = userRole.name;
         permissions = userRole.permissions as string[];
       }
     }

     return {
       session,
       role,
       permissions,
     };
   }
   ```

   > **Consideration**: Adding a DB query on every request adds latency. A future optimization could cache the role+permissions in the session or use a fast in-memory cache. For v1, direct DB lookup is acceptable.

### 6.5 Permission Middleware

**File**: `packages/api/src/index.ts` (or a new `packages/api/src/permissions.ts`)

Create a middleware factory:

```ts
import { TRPCError } from "@trpc/server";

export function requirePermissions(...required: string[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    // Admin wildcard
    if (ctx.permissions.includes("*")) {
      return next({ ctx });
    }

    const hasAll = required.every((p) => ctx.permissions.includes(p));
    if (!hasAll) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing required permissions: ${required.join(", ")}`,
      });
    }

    return next({ ctx });
  });
}
```

Then export a procedure builder:

```ts
export const permittedProcedure = (permissions: string[]) =>
  t.procedure.use(requirePermissions(...permissions));
```

### 6.6 Router Updates

**File**: `packages/api/src/routers/index.ts`

Example usage:

```ts
export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),

  privateData: protectedProcedure.query(({ ctx }) => ({
    message: "This is private",
    user: ctx.session.user,
  })),

  // New: leads router with permission checks
  leads: router({
    list: permittedProcedure(["leads:read"]).query(() => {
      // fetch leads
    }),
    create: permittedProcedure(["leads:write"]).mutation(({ input }) => {
      // create lead
    }),
  }),
});
```

### 6.7 UI Components

**File**: `packages/ui/src/` or `apps/web/src/components/`

#### `<Can>` component

```tsx
// Conditionally renders children based on permissions
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { permissions } = useSession();
  const hasPermission = permissions.includes("*") || permissions.includes(permission);
  return hasPermission ? <>{children}</> : <>{fallback}</>;
}
```

#### Hooks

```ts
// usePermissions() — returns the permissions array from session
// useRole() — returns the role name from session
```

#### Enriching the Session

The session user object will include `roleId` after the Better Auth config change. The client-side trpc utils can expose a hook:

```ts
export function useSessionPermissions() {
  const { data: session } = trpc.auth.session.useQuery();
  return session?.user?.roleId ? resolvePermissions(session.user.roleId) : [];
}
```

But ideally the session itself should carry permissions. A better approach for v1:

1. Fetch the session via Better Auth client (`authClient.useSession()`).
2. In a React context provider, resolve the role name and permissions from a trpc query `getMyPermissions` that returns the user's resolved role+permissions.
3. Provide `useRole()` and `usePermissions()` hooks.

### 6.8 Middleware (Optional — Route-Level Protection)

**File**: `apps/web/src/middleware.ts`

Next.js middleware can perform coarse-grained route protection:

```ts
import { auth } from "@crm-fran/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Protected routes
  const protectedPaths = ["/dashboard", "/leads", "/settings", "/admin"];
  const isProtected = protectedPaths.some((p) => nextUrl.pathname.startsWith(p));

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Admin-only routes
  const adminPaths = ["/admin"];
  const isAdminPath = adminPaths.some((p) => nextUrl.pathname.startsWith(p));
  if (isAdminPath && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});
```

> **Note**: This middleware is optional in v1. The authoritative enforcement is at the tRPC level. Middleware provides UX polish (redirect before page load).

---

## 7. Affected Packages

| Package | Changes Required | Complexity |
|---|---|---|
| `packages/db` | Drop `user.role`, add default for `roleId`, add `rolesRelations`, create migration + seed | Medium |
| `packages/auth` | Replace `role` with `roleId` in `additionalFields` | Low |
| `packages/api` | Enhance context, add permission middleware, update routers | Medium |
| `apps/web` | Add UI components/hooks, optionally add `middleware.ts` | Medium |

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Breaking existing sessions** — after dropping `user.role`, old sessions may reference a field that no longer exists | Medium | Better Auth stores the user payload in the session token. After migration, existing tokens still carry the old `role` field. **Mitigation**: Invalidate all sessions after the migration, or handle both fields in the short term. |
| **Permission cache staleness** — admin changes a role's permissions but existing sessions still have old permissions | Medium | Permissions are resolved from the DB on each request in v1. No caching issue. UI components re-render on session refresh. |
| **Role deletion leaves orphan references** | High | Enforce FK constraint + app-level check before deletion. Migration ensures no orphan references. |
| **Migration complexity** — backfilling `roleId` for existing users requires mapping string roles to role IDs | Medium | Map explicitly documented in migration script. Dry-run before applying. |
| **Performance** — extra DB query on every tRPC request | Low | v1 priority is correctness. Caching (session enrichment, Redis, or in-memory) is a future optimization. |

---

## 9. Rollback Plan

If the RBAC change causes issues:

1. **Revert the migration**: Run a down migration that restores `user.role` text column and removes `user.roleId` default.
2. **Revert code changes**: Git revert commits on `packages/auth`, `packages/api`, `apps/web`.
3. **Re-deploy**: Rebuild and deploy.
4. **Data integrity**: Since `user.role` backfill wrote the role name from the FK join, the restored `user.role` will have the same values as before.

> **Design decision**: Keep the migration reversible. The `user.role` column drop should be in a separate migration step from the schema change, so it can be rolled back independently.

---

## 10. Success Criteria

| Criterion | How to Verify |
|---|---|
| **Caller cannot access admin data** | Caller logs in, calls `admin-only` tRPC procedure → receives `FORBIDDEN` error |
| **Admin can access everything** | Admin logs in, calls any procedure → succeeds |
| **UI hides unauthorized elements** | Caller visits admin page → elements are hidden or user is redirected. Admin sees full UI. |
| **New user gets caller role** | Register a new user → verify `roleId` points to the "Caller" role |
| **Permission check works** | Add a new permission `leads:export` to a role → user with that role can access the export endpoint without code changes |
| **No regressions on existing auth** | Existing login, session, logout flows continue to work |

---

## 11. Future Considerations (Out of Scope for v1)

- **Admin panel for role management** (CRUD for roles, user role assignment UI)
- **Permission groups** (e.g., "Leads Team" with combined permissions)
- **Row-level security** (e.g., "caller can only see their assigned leads")
- **Permission cache** (Redis or session enrichment to avoid DB lookup on every request)
- **Audit log** for role changes and permission checks
- **API key roles** (for system-to-system access with limited permissions)

---

## 12. Resolved Decisions

The following questions from the proposal review have been answered by the product owner:

1. **Default role ID**: Use **human-readable slugs** — `role-caller`, `role-closer`, `role-admin`. Easier for migrations and debugging.
2. **Session invalidation**: **Force logout** all users after the migration. Old JWT tokens containing the legacy `role` field are invalidated.
3. **UI fallback**: **Hidden entirely**. Elements that the user lacks permission for do not render.
4. **Permission granularity**: **`domain:action`** level (e.g., `leads:read`, `leads:write`). No sub-actions for v1.
5. **Closer permissions**: Default set — `leads:*`, `deals:*`, `reports:read`, `profile:*`.

