# Roles and Permissions — Specification

> **Change**: `roles-and-permissions`
> **Status**: Specified
> **Author**: SDD executor
> **Date**: 2026-06-14
> **Domains**: `auth`, `api`, `ui`

> **Note**: This is a legacy flat spec file. The OpenSpec convention for future changes is `openspec/changes/{change}/specs/{domain}/spec.md`. Archive tooling should treat this as equivalent to `specs/auth/spec.md + specs/api/spec.md + specs/ui/spec.md`.

---

## 1. Domain: Auth — Database Schema

### 1.1 Roles Table (unchanged)

The `roles` table already exists and remains unchanged in structure. It is used only for seed data.

```ts
// packages/db/src/schema/auth.ts — roles table (excerpt, kept as-is)
export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  permissions: json("permissions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
```

### 1.2 User Table (modified)

**Requirement: The `user` table MUST drop the `role` text column and add a `$default()` on `roleId` pointing to `"role-caller"`.**

(Previously: `role` column existed with `$default(() => "caller")` and `roleId` had no default.)

```ts
// packages/db/src/schema/auth.ts — user table (final state)
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // REMOVED: role: text("role").$default(() => "caller").notNull(),
  roleId: text("role_id")
    .references(() => roles.id)
    .$default(() => "role-caller")          // ← ADDED default
    .notNull(),
  leadActive: text("lead_active"),
  scoring: integer("scoring"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
```

#### Scenario: New user gets caller role by default

- GIVEN a new user signs up without specifying a `roleId`
- WHEN the user record is inserted
- THEN `user.roleId` MUST default to `"role-caller"`

#### Scenario: Existing user retains roleId after migration

- GIVEN a user had `user.role = "caller"` before migration
- WHEN migration backfills `user.roleId`
- THEN `user.roleId` MUST be `"role-caller"`

### 1.3 Roles Relations (added)

**Requirement: The system MUST provide an inverse relation from `roles` to `users`.**

(Previously: no `rolesRelations` existed.)

```ts
// packages/db/src/schema/auth.ts — added relations
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(user),
}));
```

### 1.4 User Relations (unchanged verification)

The existing `userRelations` already links `user.roleId` → `roles.id` and requires no structural change:

```ts
// packages/db/src/schema/auth.ts — userRelations (kept as-is)
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  role: one(roles, {
    fields: [user.roleId],
    references: [roles.id],
  }),
}));
```

### 1.5 Schema Index Exports

**Requirement: The schema index MUST export all tables and all relations including the new `rolesRelations`.**

The current `packages/db/src/schema/index.ts`:

```ts
export * from "./auth";
export {};
```

This already re-exports everything from `auth.ts`, so no index change is needed. Verification: `rolesRelations` will be exported automatically once defined in `auth.ts`.

### 1.6 Role Seed Data

**Requirement: Three roles MUST be seeded in the database:**

| Role ID | Name | Permissions |
|---|---|---|
| `role-caller` | Caller | `["leads:read", "leads:write", "profile:read", "profile:write"]` |
| `role-closer` | Closer | `["leads:*", "deals:*", "reports:read", "profile:*"]` |
| `role-admin` | Admin | `["*"]` |

#### Scenario: All three roles exist after migration

- GIVEN the migration has been applied
- WHEN querying the `roles` table
- THEN rows with ids `role-caller`, `role-closer`, and `role-admin` MUST exist
- AND each role MUST have the exact permission set specified above

---

## 2. Domain: Auth — TypeScript Types

### 2.1 Permission Union Type

**Requirement: A `Permission` type MUST exist as a union of all valid `domain:action` strings.**

```ts
// packages/db/src/schema/auth.ts or a new packages/api/src/permissions.ts
export type Permission =
  | "leads:read"
  | "leads:write"
  | "leads:delete"
  | "leads:*"
  | "deals:read"
  | "deals:write"
  | "deals:*"
  | "reports:read"
  | "users:read"
  | "users:write"
  | "profile:read"
  | "profile:write"
  | "profile:*"
  | "settings:read"
  | "settings:write"
  | "*";
```

The wildcard `"*"` at the role level grants access to **all** permissions regardless of domain. The wildcard `"domain:*"` grants access to **all** actions within that domain.

#### Scenario: Permission check for a specific action

- GIVEN a role has `"leads:read"` in its permissions array
- WHEN checking `permissions.includes("leads:read")`
- THEN it MUST return `true`

#### Scenario: Wildcard permission grants all

- GIVEN a role has `"*"` in its permissions array
- WHEN checking `permissions.includes("leads:read")`
- THEN it MUST return `true`
- AND `permissions.includes("users:write")` MUST also return `true`

### 2.2 Resolved Role Type

**Requirement: The resolved role shape used at runtime MUST be:**

```ts
export type ResolvedRole = {
  id: string;               // role-caller | role-closer | role-admin
  name: string;             // Caller | Closer | Admin
  permissions: Permission[];
};
```

This is the shape returned by a DB query on the `roles` table and exposed in `ctx.role`.

---

## 3. Domain: Auth — Better Auth Configuration

### 3.1 Additional Fields

**Requirement: The Better Auth `additionalFields` config MUST replace `role` with `roleId`.**

(Previously: `role: { type: "string", input: true }` existed. Previously: `roleId` was absent from `additionalFields`.)

```ts
// packages/auth/src/index.ts — final additionalFields
user: {
  additionalFields: {
    roleId: {
      type: "string",
      input: true,       // allow setting during sign-up
      required: true,    // every user must have a role
    },
    leadActive: {
      type: "string",
      input: false,
    },
    scoring: {
      type: "number",
      input: false,
    },
  },
},
```

#### Scenario: New user sign-up sets roleId

- GIVEN a new user signs up via email/password
- WHEN the user record is created
- THEN the session user object MUST contain `roleId: "role-caller"`
- AND the session user object MUST NOT contain a `role` field

#### Scenario: Existing session returns roleId

- GIVEN an existing (re-logged-in) user
- WHEN `auth.api.getSession()` is called
- THEN the returned `session.user` MUST contain `roleId`

---

## 4. Domain: API — Context Shape

### 4.1 Enhanced Context

**Requirement: The tRPC context MUST expose the user's resolved role name and permissions array.**

(Previously: context returned only `{ auth: null, session }`.)

```ts
// packages/api/src/context.ts — final shape
export async function createContext(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  let role: ResolvedRole | null = null;

  if (session?.user?.roleId) {
    const db = createDb();
    const userRole = await db.query.roles.findFirst({
      where: (roles, { eq }) => eq(roles.id, session.user.roleId),
    });
    if (userRole) {
      role = {
        id: userRole.id,
        name: userRole.name,
        permissions: (userRole.permissions ?? []) as Permission[],
      };
    }
  }

  return {
    session,
    role,                          // ResolvedRole | null
    permissions: role?.permissions ?? ([] as Permission[]),  // Permission[]
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

#### Scenario: Authenticated user has role and permissions in context

- GIVEN a user is logged in with a valid session
- WHEN `createContext` is called
- THEN `ctx.role` MUST be a `ResolvedRole` object
- AND `ctx.permissions` MUST be a `Permission[]` matching the user's role

#### Scenario: Unauthenticated request has null role

- GIVEN no session exists
- WHEN `createContext` is called
- THEN `ctx.role` MUST be `null`
- AND `ctx.permissions` MUST be `[]`

#### Scenario: Session user with missing roleId has null role

- GIVEN a session exists but `session.user.roleId` is null/undefined
- WHEN `createContext` is called
- THEN `ctx.role` MUST be `null`
- AND `ctx.permissions` MUST be `[]`

---

## 5. Domain: API — Permission Middleware

### 5.1 Middleware Factory

**Requirement: A `requirePermissions(...)` middleware factory MUST exist that checks context permissions and rejects unauthorized requests.**

```ts
// packages/api/src/permissions.ts
import { TRPCError } from "@trpc/server";
import { t } from "./index";
import type { Permission } from "./permissions";  // or from @crm-fran/db

export function requirePermissions(...required: Permission[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Admin wildcard grants everything
    if (ctx.permissions.includes("*")) {
      return next({ ctx });
    }

    // Check each required permission
    // Domain wildcard (e.g., "leads:*") matches any "leads:xxx" action
    const hasAll = required.every((req) => {
      // Direct match
      if (ctx.permissions.includes(req)) return true;

      // Domain wildcard match: if req is "leads:read", check if "leads:*" is in permissions
      const [reqDomain] = req.split(":");
      if (reqDomain && ctx.permissions.includes(`${reqDomain}:*`)) return true;

      return false;
    });

    if (!hasAll) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing required permissions: ${required.join(", ")}`,
      });
    }

    return next({ ctx });
  });
}

// Convenience builder
export function permittedProcedure(permissions: Permission[]) {
  return t.procedure.use(requirePermissions(...permissions));
}
```

#### Scenario: User with matching permission passes

- GIVEN a user with `permissions = ["leads:read"]`
- WHEN calling `requirePermissions("leads:read")`
- THEN the middleware MUST call `next()`

#### Scenario: User without matching permission is rejected

- GIVEN a user with `permissions = ["leads:read"]`
- WHEN calling `requirePermissions("leads:write")`
- THEN the middleware MUST throw `FORBIDDEN`

#### Scenario: Domain wildcard grants sub-action

- GIVEN a user with `permissions = ["leads:*"]`
- WHEN calling `requirePermissions("leads:read")`
- THEN the middleware MUST call `next()`
- AND `requirePermissions("leads:write", "leads:delete")` MUST also pass

#### Scenario: Admin wildcard grants everything

- GIVEN a user with `permissions = ["*"]`
- WHEN calling `requirePermissions("leads:read", "users:write", "settings:read")`
- THEN the middleware MUST call `next()`

#### Scenario: Unauthenticated user is rejected

- GIVEN `ctx.session` is falsy
- WHEN calling `requirePermissions("leads:read")`
- THEN the middleware MUST throw `UNAUTHORIZED`

---

## 6. Domain: API — Router Contracts

### 6.1 Existing Router Updates

**Requirement: All existing and future tRPC procedures that access protected resources MUST use `requirePermissions(...)` or `permittedProcedure(...)`.**

#### Scenario: Health check stays public

- GIVEN the `healthCheck` procedure
- WHEN any user (or unauthenticated request) calls it
- THEN it MUST return `"OK"` without any permission check

#### Scenario: Private data procedure requires authentication

- GIVEN the `privateData` procedure
- WHEN an unauthenticated user calls it
- THEN `protectedProcedure` MUST throw `UNAUTHORIZED`

### 6.2 Leads Router Example

**Requirement: A leads router MUST use permission checks at the procedure level.**

```ts
// packages/api/src/routers/leads.ts (illustrative — actual file may differ)
export const leadsRouter = router({
  list: permittedProcedure(["leads:read"]).query(() => {
    // fetch and return leads
  }),
  getById: permittedProcedure(["leads:read"]).query(({ input }) => {
    // fetch single lead
  }),
  create: permittedProcedure(["leads:write"]).mutation(({ input }) => {
    // create lead
  }),
  update: permittedProcedure(["leads:write"]).mutation(({ input }) => {
    // update lead
  }),
  delete: permittedProcedure(["leads:delete"]).mutation(({ input }) => {
    // soft-delete lead
  }),
});
```

### 6.3 Permission Requirements by Domain

| Resource | Action | Required Permission | Notes |
|---|---|---|---|
| Health | Check | none | Public |
| Auth | Session | none | Protected by session check |
| Leads | List | `leads:read` | |
| Leads | Get | `leads:read` | |
| Leads | Create | `leads:write` | |
| Leads | Update | `leads:write` | |
| Leads | Delete | `leads:delete` | Caller does not have this |
| Deals | List/Get | `deals:read` | |
| Deals | Create/Update | `deals:write` | |
| Reports | Read | `reports:read` | |
| Users | List/Get | `users:read` | Admin only in practice |
| Users | Create/Update | `users:write` | Admin only |
| Profile | Read | `profile:read` | Self-profile, always available to caller |
| Profile | Update | `profile:write` | Self-profile |
| Settings | Read | `settings:read` | Admin only |
| Settings | Update | `settings:write` | Admin only |

> **Note**: For resources not yet implemented (e.g., Deals, Reports, Users management), the permission requirement is specified for when they are added. The middleware pattern is defined and ready.

---

## 7. Domain: UI — Permission Components

### 7.1 `<Can>` Component

**Requirement: A `<Can>` component MUST conditionally render children based on the current user's permissions.**

```tsx
// packages/ui/src/permissions/can.tsx
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { permissions } = usePermissions();

  if (permissions.includes("*")) return <>{children}</>;
  if (permissions.includes(permission)) return <>{children}</>;

  // Domain wildcard match
  const [domain] = permission.split(":");
  if (domain && permissions.includes(`${domain}:*`)) return <>{children}`;

  return <>{fallback}</>;
}
```

#### Scenario: User with permission sees children

- GIVEN the current user has `permissions = ["leads:read"]`
- WHEN rendering `<Can permission="leads:read"><LeadButton /></Can>`
- THEN `<LeadButton />` MUST render

#### Scenario: User without permission sees fallback

- GIVEN the current user has `permissions = ["leads:read"]`
- WHEN rendering `<Can permission="leads:delete"><DeleteButton /></Can>`
- THEN `<DeleteButton />` MUST NOT render
- AND the fallback (default `null`) MUST render instead

### 7.2 `usePermissions()` Hook

**Requirement: A `usePermissions()` hook MUST return the current user's permission array.**

```tsx
export function usePermissions(): { permissions: Permission[] } {
  // Consumes either:
  //   (a) trpc.auth.getMyPermissions query, OR
  //   (b) a React context provider that enriches the session with resolved permissions
  //
  // Returns the permissions array or empty array if not authenticated.
}
```

### 7.3 `useRole()` Hook

**Requirement: A `useRole()` hook MUST return the current user's resolved role.**

```tsx
export function useRole(): { role: ResolvedRole | null } {
  // Same source as usePermissions
}
```

### 7.4 Session Enrichment Strategy

**Requirement: The UI MUST resolve role and permissions on the client either via a dedicated tRPC query or by enriching the session object.**

Option A (recommended for v1): A tRPC procedure `auth.getMyPermissions` that returns `{ role: ResolvedRole | null, permissions: Permission[] }`.

Option B (future): Extend the Better Auth session to include a `permissions` claim. Requires a custom session callback in Better Auth.

#### Scenario: UI resolves permissions on page load

- GIVEN a user navigates to a protected page
- WHEN the page loads
- THEN the UI MUST call a `getMyPermissions`-equivalent query
- AND the result MUST be available before rendering permission-gated content
- OR the client MUST use a loading state until permissions are resolved

---

## 8. Migration Plan

### 8.1 Migration Steps (DDL + Data)

| Step | SQL / Drizzle Operation | Reversible? |
|---|---|---|
| 1. Seed roles | Insert `role-caller`, `role-closer`, `role-admin` into `roles` table via seed script or migration `up` | Yes |
| 2. Backfill `roleId` | `UPDATE "user" SET role_id = 'role-caller' WHERE role = 'caller' AND role_id IS NULL;` Same for `closer`→`role-closer`, `admin`→`role-admin`. Any unmapped string value → `role-caller`. | Yes |
| 3. Add `$default()` on `roleId` | Drizzle schema change — new migration alters column defaults | Yes (drop default) |
| 4. Drop `user.role` column | `ALTER TABLE "user" DROP COLUMN "role";` | No (data loss if not backed up) — perform after verification |
| 5. Invalidate all sessions | Force logout by clearing session tokens or using Better Auth's session revocation. | No |

### 8.2 Migration Script (Conceptual)

```ts
// drizzle/<timestamp>_seed_roles_and_migrate.ts
import { db } from "@crm-fran/db";

async function up() {
  // Step 1: Seed roles
  await db.insert(roles).values([
    { id: "role-caller", name: "Caller", permissions: ["leads:read", "leads:write", "profile:read", "profile:write"] },
    { id: "role-closer", name: "Closer", permissions: ["leads:*", "deals:*", "reports:read", "profile:*"] },
    { id: "role-admin", name: "Admin", permissions: ["*"] },
  ]).onConflictDoNothing();

  // Step 2: Backfill roleId for existing users
  await db.update(user)
    .set({ roleId: "role-caller" })
    .where(and(eq(user.role, "caller"), isNull(user.roleId)));

  await db.update(user)
    .set({ roleId: "role-closer" })
    .where(and(eq(user.role, "closer"), isNull(user.roleId)));

  await db.update(user)
    .set({ roleId: "role-admin" })
    .where(and(eq(user.role, "admin"), isNull(user.roleId)));

  // Step 3: Handle any users with unmapped roles → default to caller
  await db.update(user)
    .set({ roleId: "role-caller" })
    .where(and(not(eq(user.role, "caller")), not(eq(user.role, "closer")), not(eq(user.role, "admin")), isNull(user.roleId)));
}

async function down() {
  // Reverse: restore role from roleId FK join
  // Drop roleId default
  // Re-add role column
}
```

### 8.3 Force Logout

After the migration, all users MUST be force-logged out so their JWT/session tokens are regenerated without the legacy `role` field.

**Requirement**: A script or admin API call MUST clear all sessions/tokens after the migration.

#### Scenario: Old session tokens fail after migration

- GIVEN a user had a session token before the migration
- WHEN they make a request after the migration without re-logging in
- THEN `auth.api.getSession()` MUST return null/undefined for that token
- AND the user MUST be redirected to login

---

## 9. Risks and Constraints

| Risk | Impact | Mitigation |
|---|---|---|
| **`roleId` default in Drizzle schema won't apply to existing DB rows** | Medium | The `$default()` only affects new inserts. Existing rows need the backfill update in the migration. |
| **`rolesRelations` export may not be picked up by Drizzle kit without re-generating** | Low | Run `drizzle-kit generate` after adding the relation. Verify the generated migration includes the inverse relation metadata. |
| **Better Auth session user shape change** | Medium | After removing `role` from `additionalFields`, any code that reads `session.user.role` will break. Must grep for all references and update before deployment. |
| **Permission middleware performance** | Low | Each tRPC request with permission middleware does one DB query to resolve the role. Acceptable for v1. Future: cache in session or Redis. |

---

## 10. Open Decisions / Future Work (Out of Scope for This Spec)

- Admin panel UI for managing roles and user assignments
- Row-level security (e.g., "caller sees only their assigned leads")
- Audit logging for permission checks
- Role change without session invalidation (UI re-render on refresh)
- Cache layer for role/permission resolution
