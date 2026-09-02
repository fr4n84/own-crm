# Roles and Permissions — Implementation Tasks

> **Change**: `roles-and-permissions`
> **Status**: Draft
> **Date**: 2026-06-14
> **Based on**: `openspec/changes/roles-and-permissions/design.md` + `openspec/changes/roles-and-permissions/spec.md`

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~527 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB) → PR 2 (Server) → PR 3 (UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (approved by user)
400-line budget risk: High
```

### Forecast Notes

- **~527 estimated lines** across 18 file actions (9 modified + 9 new).
- **Risk is High** because the estimate likely exceeds 400 when you include generated migration boilerplate, seed data, and UI component scaffolding.
- **Chained PRs are recommended** to stay within the 400-line review budget and to provide clean rollback boundaries per layer.
- **Chain strategy is pending** — the supervisor should decide between `stacked-to-main` (each PR merges to main sequentially) vs `feature-branch-chain` (each PR targets a shared feature branch).
- The `ask-on-risk` delivery strategy means: if total is >400, pause and ask the user before deciding the split.

---

## Dependency Graph

```
PR 1 ──────────► PR 2 ──────────► PR 3
DB Layer         Server Layer      UI Layer
┌──────┐        ┌──────────┐     ┌──────────┐
│ T1.1 │──┐     │ T2.1     │     │ T6.1     │
│ T1.2 │──┤     │   │      │     │ T6.2     │
│ T1.3 │──┤     │ T3.1     │     │ T6.3     │
│ T7.1 │──┤     │   │      │     │ T6.4     │
│ T7.2 │──┘     │ T4.1     │     │ T6.5     │
└──────┘        │   │      │     │ T6.6     │
                │ T5.1 ◄──┤     │ T6.7     │
                │ T5.2 ◄──┤     │ T6.8     │
                │ T5.3 ◄──┤     │ T8.1     │
                └──────────┘     └──────────┘
```

**Key dependencies:**
- T3.1 (context) depends on T2.1 (auth config) — needs `roleId` in session
- T4.1 (middleware) depends on T3.1 (context) — needs `ctx.permissions`
- T5.1 / T5.2 / T5.3 (routers) depend on T4.1 (middleware)
- T6.x (UI) depends on T5.2 (auth router) — `getMyPermissions` procedure
- T7.2 (migration) depends on T7.1 (seed script logic) and T1.x (schema types)
- T8.1 (session invalidation) is last — runs after all schema + code changes are deployed

---

## Chained PR Recommendation

### PR 1: Database Layer (~100 lines)
**Path**: `main` → `chore/roles-and-permissions-db`
**Tasks**: T1.1, T1.2, T1.3, T7.1, T7.2
**Boundary**: Schema types are exported and the DB has roles seeded + users backfilled.
**Rollback**: Revert migration 0002, drop `roles` table, re-add `role` column if needed.

### PR 2: Server Auth & Permissions (~215 lines)
**Path**: `main` or `chore/roles-and-permissions-db` → `chore/roles-and-permissions-server`
**Tasks**: T2.1, T3.1, T4.1, T5.1, T5.2, T5.3
**Boundary**: tRPC context resolves permissions, middleware enforces them, example routers work.
**Rollback**: Revert context.ts, permissions.ts, router changes. Auth config revert to `role`.

### PR 3: Client UI + Cleanup (~212 lines)
**Path**: `main` or `chore/roles-and-permissions-server` → `chore/roles-and-permissions-ui`
**Tasks**: T6.1, T6.2, T6.3, T6.4, T6.5, T6.6, T6.7, T6.8, T8.1
**Boundary**: PermissionProvider wraps the app, `<Can>` + hooks work, sign-up sends `roleId`, old sessions invalidated.
**Rollback**: Revert providers, sign-up form, auth-client, remove PermissionProvider, restore old sessions.

---

## Task List

### PR 1 — Database Layer

#### T1.1 Add `$default()` on `roleId` column

- [x] T1.1 — Add `$default(() => "role-caller")` to the `roleId` column definition in `packages/db/src/schema/auth.ts`
  - **Files**: `packages/db/src/schema/auth.ts`
  - **Change**: Insert `.$default(() => "role-caller")` between `references(() => roles.id)` and `.notNull()` on the `roleId` column
  - **Acceptance**: After change, `user.roleId` has `$default(() => "role-caller")` in Drizzle schema. New inserts without `roleId` get `"role-caller"`.
  - **Est. lines**: 1 changed
  - **Depends on**: None

#### T1.2 Export `Permission` and `ResolvedRole` types

- [x] T1.2 — Add the `Permission` union type and `ResolvedRole` interface at the top of `packages/db/src/schema/auth.ts` (before table definitions)
  - **Files**: `packages/db/src/schema/auth.ts`
  - **Change**: Add `Permission` union (16 variants + wildcards) and `ResolvedRole` interface
  - **Acceptance**: Both types are exported from `@crm-fran/db/schema/auth`. TypeScript `--noEmit` passes when importing either type.
  - **Est. lines**: ~20 added
  - **Depends on**: None

#### T1.3 Add `rolesRelations` inverse relationship

- [x] T1.3 — Define `rolesRelations` in `packages/db/src/schema/auth.ts` to provide the inverse relation from `roles` → `users`
  - **Files**: `packages/db/src/schema/auth.ts`
  - **Change**: Add `export const rolesRelations = relations(roles, ({ many }) => ({ users: many(user) }));` after the existing `userRelations` block
  - **Acceptance**: `rolesRelations` is exported and TypeScript resolves `db.query.roles.findMany({ with: { users: true } })` without error.
  - **Est. lines**: ~5 added
  - **Depends on**: T1.1 (file being edited)

#### T1.4 Create seed script

- [x] T1.4 — Create `packages/db/src/seed/auth/authSeed.ts` with seed data for the three roles: `role-caller`, `role-closer`, `role-admin`
  - **Files**: `packages/db/src/seed/auth/authSeed.ts` (NEW)
  - **Content**: Use `db.insert(roles).values(...).onConflictDoNothing()` to insert the three roles with their exact permission sets from the spec
  - **Acceptance**: Running `pnpm --filter @crm-fran/db exec pnpm dlx tsx src/seed/auth/authSeed.ts` inserts exactly 3 rows into the `roles` table. Idempotent: running it twice does not create duplicates.
  - **Est. lines**: ~50
  - **Depends on**: T1.1, T1.2

#### T1.5 Generate and customize Drizzle migration

- [x] T1.5 — Run `drizzle-kit generate` to produce migration 0002, then customise it to ensure seed + backfill happen before column drop
  - **Files**: `packages/db/src/migrations/0002_<generated_tag>.sql` (generated + hand-edited), `packages/db/src/migrations/meta/0002_snapshot.json` (generated)
  - **Steps**:
    1. Run `pnpm --filter @crm-fran/db exec drizzle-kit generate` to capture schema diff (creates `roles` table, adds `role_id`, drops `role`)
    2. **Edit the generated SQL** to reorder operations:
       - Keep `CREATE TABLE IF NOT EXISTS "roles"`
       - Keep `ALTER TABLE "user" ADD COLUMN "role_id"`
       - **Insert seed INSERT statements** (role-caller, role-closer, role-admin)
       - **Insert UPDATE backfill** from old `role` column values to `role_id`
       - Only then include `ALTER TABLE "user" DROP COLUMN "role"`
    3. **Add NOT NULL + FK** if not already generated: `ALTER TABLE "user" ALTER COLUMN "role_id" SET NOT NULL;` and FK constraint
  - **Acceptance**: Migration runs end-to-end without errors. After applying:
    - `roles` table has 3 seeded rows
    - Existing users have `role_id` backfilled from their `role` values (unmapped → `role-caller`)
    - `role` column no longer exists
    - `role_id` is NOT NULL with FK to `roles.id`
  - **Est. lines**: ~30 (generated + hand-added)
  - **Depends on**: T1.1, T1.2, T1.3, T1.4

---

### PR 2 — Server Auth & Permissions

#### T2.1 Update Better Auth `additionalFields` for `roleId`

- [x] T2.1 — Update `packages/auth/src/index.ts` to add `required: true` and `defaultValue: "role-caller"` to the `roleId` additional field config (defense in depth at API boundary)
  - **Files**: `packages/auth/src/index.ts`
  - **Change**: Update the `roleId` block in `additionalFields` from `{ type: "string", input: true }` to `{ type: "string", input: true, required: true, defaultValue: "role-caller" }`
  - **Acceptance**: Sign-up without `roleId` is rejected by Better Auth (defense in depth at API boundary). Sign-up with `roleId: "role-closer"` uses that value. `session.user.roleId` is always a string. Frontend form (`sign-up-form.tsx`) sends `roleId` from the role selector.
  - **Est. lines**: ~5 changed
  - **Depends on**: PR 1 (types and schema must exist)
  - **Note**: Decision A — server as strict gatekeeper. `required: true` enforces at the API boundary; `defaultValue` is a DB safety net for direct inserts/migrations.

#### T3.1 Enhance tRPC context with role/permission resolution

- [x] T3.1 — Modify `packages/api/src/context.ts` to resolve the user's `ResolvedRole` and `Permission[]` from the database, adding `role` and `permissions` to the context
  - **Files**: `packages/api/src/context.ts`
  - **Changes**:
    1. Import `db` from `@crm-fran/db` (singleton)
    2. Import `Permission`, `ResolvedRole` from `@crm-fran/db/schema/auth`
    3. Add role resolution logic: if `session?.user?.roleId` exists, query `roles` table using `db.query.roles.findFirst()`, cast `permissions` JSON to `Permission[]`, and build `ResolvedRole`
    4. Return `{ session, role, permissions }` instead of `{ auth: null, session }`
    5. Remove the stale `auth: null` field
  - **Acceptance**:
    - Authenticated user: `ctx.role` is a `ResolvedRole`, `ctx.permissions` is `Permission[]`
    - Unauthenticated: `ctx.role` is `null`, `ctx.permissions` is `[]`
    - Session exists but user has no roleId (edge case): `ctx.role` is `null`, `ctx.permissions` is `[]`
  - **Est. lines**: ~40 (mostly new code, some lines replaced)
  - **Depends on**: T2.1 (auth config must serve `roleId` in session)

#### T4.1 Create permission middleware

- [x] T4.1 — Implement permission enforcement in `packages/api/src/trpc/trpc.ts` (decision A: keep middleware co-located with `protectedProcedure`; `packages/api/src/permissions.ts` stays as a pure-helper file with only `hasPermission`)
  - **Files**: `packages/api/src/trpc/trpc.ts` (modify), `packages/api/src/permissions.ts` (existing)
  - **Content**:
    - `packages/api/src/permissions.ts` exports `hasPermission(userPerms: Permission[], required: Permission): boolean` pure helper that handles admin wildcard (`"*"`), direct match, and domain wildcard (`"domain:*"`)
    - `packages/api/src/trpc/trpc.ts` defines `permittedProcedure(permissions: Permission[])` middleware that:
      - Throws `UNAUTHORIZED` if `!ctx.session`
      - Throws `FORBIDDEN` if `!ctx.permissions` (defensive: server as strict gatekeeper; never silently pass through with empty permissions)
      - Skips per-permission check if `ctx.permissions` includes `"*"` (admin wildcard)
      - For each required permission: calls `hasPermission(ctx.permissions, required)`, throws `FORBIDDEN` if any missing
  - **Acceptance**:
    - User with matching permission → passes
    - User without matching permission → `FORBIDDEN`
    - User with empty `ctx.permissions` (e.g. session exists but no `roleId`) → `FORBIDDEN` (defensive)
    - User with `"*"` → any check passes
    - User with `"leads:*"` → `leads:read`, `leads:write`, `leads:delete` pass
    - Unauthenticated → `UNAUTHORIZED`
  - **Est. lines**: ~80
  - **Depends on**: T3.1 (needs `ctx.permissions` and `ctx.session`)
  - **Note**: Decision A — server as strict gatekeeper across all layers. Co-located with `protectedProcedure` to keep auth middleware together; pure helper stays separate for testability.

#### T5.1 Create leads router with permission gates

- [x] T5.1 — Create `packages/api/src/routers/leads.ts` with 5 procedures (list, getById, create, update, delete) each using `permittedProcedure()` with appropriate permissions
  - **Files**: `packages/api/src/routers/leads.ts` (NEW)
  - **Content**: 5 procedures:
    - `list`: `permittedProcedure(["leads:read"])` → returns `[]` (stub)
    - `getById`: `permittedProcedure(["leads:read"])` → accepts `z.string()` input → returns `null` (stub)
    - `create`: `permittedProcedure(["leads:write"])` → accepts name/email/phone → returns stub
    - `update`: `permittedProcedure(["leads:write"])` → accepts id + partial fields → returns stub
    - `delete`: `permittedProcedure(["leads:delete"])` → accepts id → returns stub success
  - **Acceptance**: Each procedure enforces its permission. TypeScript compiles cleanly.
  - **Est. lines**: ~55
  - **Depends on**: T4.1 (permittedProcedure)

#### T5.2 Create auth router with `getMyPermissions` procedure

- [x] T5.2 — Create `packages/api/src/routers/auth.ts` with a `getMyPermissions` procedure that returns the current user's role and permissions
  - **Files**: `packages/api/src/routers/auth.ts` (NEW)
  - **Content**:
    - `getMyPermissions`: `permittedProcedure([])` → returns `{ role: ctx.role, permissions: ctx.permissions }`
    - Note: `permittedProcedure([])` requires authentication but no specific permission
  - **Acceptance**: Authenticated users can call `auth.getMyPermissions` and get their role/permissions. Unauthenticated users get `UNAUTHORIZED`.
  - **Est. lines**: ~20
  - **Depends on**: T4.1

#### T5.3 Update router index to register new routers and upgrade privateData

- [x] T5.3 — Update `packages/api/src/routers/index.ts` to register `leadsRouter` and `authRouter`, and upgrade `privateData` to use `permittedProcedure(["profile:read"])`
  - **Files**: `packages/api/src/routers/index.ts`
  - **Changes**:
    1. Import `leadsRouter`, `authRouter`, `permittedProcedure`
    2. Add `auth: authRouter` and `leads: leadsRouter` to `appRouter`
    3. Change `privateData` from `protectedProcedure` to `permittedProcedure(["profile:read"])` and update the query to return `role` and `permissions` alongside existing fields
  - **Acceptance**: All three routers are registered. `privateData` now requires `profile:read`. Existing `healthCheck` stays public.
  - **Est. lines**: ~15 changed
  - **Depends on**: T5.1, T5.2

---

### PR 3 — Client UI + Cleanup

#### T6.1 Create PermissionProvider and context

- [x] T6.1 — Create `packages/ui/src/permissions/auth-context.tsx` with `PermissionProvider`, `usePermissionState()`, `usePermissions()`, and `useRole()`
  - **Files**: `packages/ui/src/permissions/auth-context.tsx` (NEW)
  - **Content**:
    - `PermissionState` type: `{ role, permissions, isLoaded, isLoading, error }`
    - `PermissionContext` with default state
    - `PermissionProvider` component that accepts `resolvePermissions: () => Promise<{role, permissions}>` and manages loading/error states
    - Hooks: `usePermissionState()`, `usePermissions(): Permission[]`, `useRole(): ResolvedRole | null`
  - **Acceptance**: Provider wraps children, loads permissions via callback, exposes them via hooks. Loading/error states are tracked. Cleanup on unmount via `cancelled` flag.
  - **Est. lines**: ~90
  - **Depends on**: PR 1 (types must exist)

#### T6.2 Create `<Can>` conditional render component

- [x] T6.2 — Create `packages/ui/src/permissions/can.tsx` with the `<Can>` component
  - **Files**: `packages/ui/src/permissions/can.tsx` (NEW)
  - **Content**:
    - Props: `{ permission: Permission, fallback?: React.ReactNode, children: React.ReactNode }`
    - Uses `usePermissions()` to check access
    - Admin wildcard (`"*"`), direct match, domain wildcard match
    - Falls back to `fallback` (default `null` — hidden entirely)
  - **Acceptance**:
    - `<Can permission="leads:read"><Button /></Can>` renders Button for users with `leads:read`
    - Hidden (null fallback) for users without the permission
  - **Est. lines**: ~40
  - **Depends on**: T6.1 (needs `usePermissions`)

#### T6.3 Create `use-permissions.ts` re-export

- [x] T6.3 — Create `packages/ui/src/permissions/use-permissions.ts` that re-exports `usePermissions` from `auth-context.tsx` for clean imports
  - **Files**: `packages/ui/src/permissions/use-permissions.ts` (NEW)
  - **Est. lines**: ~5
  - **Depends on**: T6.1

#### T6.4 Create `use-role.ts` re-export

- [x] T6.4 — Create `packages/ui/src/permissions/use-role.ts` that re-exports `useRole` from `auth-context.tsx` for clean imports
  - **Files**: `packages/ui/src/permissions/use-role.ts` (NEW)
  - **Est. lines**: ~5
  - **Depends on**: T6.1

#### T6.5 Create permissions barrel export

- [x] T6.5 — Create `packages/ui/src/permissions/index.ts` that re-exports `PermissionProvider`, `usePermissionState`, `usePermissions`, `useRole`, `Can`, and `PermissionState`
  - **Files**: `packages/ui/src/permissions/index.ts` (NEW)
  - **Est. lines**: ~10
  - **Depends on**: T6.1, T6.2, T6.3, T6.4

#### T6.6 Update app providers to include PermissionProvider

- [x] T6.6 — Update `apps/web/src/components/providers.tsx` to wrap the app with `PermissionProvider`
  - **Files**: `apps/web/src/components/providers.tsx`
  - **Changes**:
    1. Import `PermissionProvider` from `@crm-fran/ui/permissions`
    2. Import `trpcClient` from `@/utils/trpc` (need to export raw client — see T6.8)
    3. Wrap `{children}` with `<PermissionProvider resolvePermissions={...}>` that calls `trpcClient.auth.getMyPermissions.query()`
    4. Place inside `QueryClientProvider` so tRPC hooks are available
  - **Acceptance**: App mounts, PermissionProvider loads permissions for authenticated users, hooks return correct data.
  - **Est. lines**: ~15 changed
  - **Depends on**: T5.2 (getMyPermissions procedure), T6.5, T6.8

#### T6.7 Update sign-up form to send `roleId` instead of `role`

- [x] T6.7 — Update `apps/web/src/components/sign-up-form.tsx` to use `roleId` field name and send `roleId` instead of `role` in the auth client call
  - **Files**: `apps/web/src/components/sign-up-form.tsx`
  - **Changes**:
    1. Rename form field `role` → `roleId` throughout (defaultValues, field name, validator, authClient call)
    2. Update the Select values to match role IDs: `"role-caller"`, `"role-closer"`, `"role-admin"` instead of `"caller"`, `"admin"`, `"closer"`
    3. Update validator from `z.string().min(1, ...)` to reflect new role ID format
  - **Acceptance**: Sign-up sends `roleId: "role-caller"` (or selected role). Form validation accepts role ID format. Auth config default applies when no roleId sent.
  - **Est. lines**: ~15 changed
  - **Depends on**: T2.1 (auth config accepts roleId)

#### T6.8 Export raw tRPC client for PermissionProvider

- [x] T6.8 — Update `apps/web/src/lib/auth-client.ts` or `apps/web/src/utils/trpc.ts` to export the raw `trpcClient` so that `PermissionProvider` can call the `auth.getMyPermissions` procedure directly (not via OptionsProxy)
  - **Files**: `apps/web/src/utils/trpc.ts`
  - **Changes**: Add `export { trpcClient };` at the bottom (the raw client already exists in the file)
  - **Acceptance**: `import { trpcClient } from "@/utils/trpc"` resolves and `trpcClient.auth.getMyPermissions.query()` returns a promise.
  - **Est. lines**: ~3 changed
  - **Depends on**: T5.2 (getMyPermissions procedure)

#### T8.1 Session invalidation

- [ ] T8.1 — Write and execute session invalidation to force all existing users to re-login after the migration
  - **Files**: Either `scripts/invalidate-sessions.ts` (NEW) or a manual SQL script
  - **Options**:
    - **Option A (Better Auth API)**: Create a script that calls the Better Auth admin API to revoke all sessions, or iterate and revoke per user
    - **Option B (SQL)**: `TRUNCATE "session"; DELETE FROM "account";` — forces all users to re-authenticate
    - **Option C (Deployment step)**: Run as a post-migration step before deployment
  - **Acceptance**: After invalidation, any existing session token returns `null` from `auth.api.getSession()`. Users are redirected to login on next request.
  - **Est. lines**: ~15
  - **Depends on**: T7.2 (migration must be applied first), PR 2 (server code must be deployed to handle new session shape)

---

## Summary Table

| Task | File(s) | Action | Est. Lines | PR | Depends On |
|------|---------|--------|-----------|----|-----------|
| T1.1 | `packages/db/src/schema/auth.ts` | Modify | 1 | 1 | — |
| T1.2 | `packages/db/src/schema/auth.ts` | Modify | 20 | 1 | — |
| T1.3 | `packages/db/src/schema/auth.ts` | Modify | 5 | 1 | T1.1 |
| T1.4 | `packages/db/src/seed.ts` | NEW | 50 | 1 | T1.1, T1.2 |
| T1.5 | Migration 0002 SQL | Generated + hand-edit | 30 | 1 | T1.1–T1.4 |
| **PR 1 total** | | | **~106** | | |
| T2.1 | `packages/auth/src/index.ts` | Modify | 5 | 2 | PR 1 |
| T3.1 | `packages/api/src/context.ts` | Modify | 40 | 2 | T2.1 |
| T4.1 | `packages/api/src/permissions.ts` | NEW | 80 | 2 | T3.1 |
| T5.1 | `packages/api/src/routers/leads.ts` | NEW | 55 | 2 | T4.1 |
| T5.2 | `packages/api/src/routers/auth.ts` | NEW | 20 | 2 | T4.1 |
| T5.3 | `packages/api/src/routers/index.ts` | Modify | 15 | 2 | T5.1, T5.2 |
| **PR 2 total** | | | **~215** | | |
| T6.1 | `packages/ui/src/permissions/auth-context.tsx` | NEW | 90 | 3 | PR 1 |
| T6.2 | `packages/ui/src/permissions/can.tsx` | NEW | 40 | 3 | T6.1 |
| T6.3 | `packages/ui/src/permissions/use-permissions.ts` | NEW | 5 | 3 | T6.1 |
| T6.4 | `packages/ui/src/permissions/use-role.ts` | NEW | 5 | 3 | T6.1 |
| T6.5 | `packages/ui/src/permissions/index.ts` | NEW | 10 | 3 | T6.1–T6.4 |
| T6.6 | `apps/web/src/components/providers.tsx` | Modify | 15 | 3 | T6.5, T6.8 |
| T6.7 | `apps/web/src/components/sign-up-form.tsx` | Modify | 15 | 3 | T2.1 |
| T6.8 | `apps/web/src/utils/trpc.ts` | Modify | 3 | 3 | T5.2 |
| T8.1 | `scripts/invalidate-sessions.ts` or SQL | NEW | 15 | 3 | T7.2, PR 2 |
| **PR 3 total** | | | **~198** | | |
| **Grand total** | | | **~527** | | |

---

## Phase Ordering Notes

1. **DB schema first**: The schema is the source of truth. All other layers depend on it.
2. **Auth config before API**: The context resolver needs `session.user.roleId` which comes from Better Auth.
3. **API context before middleware**: Middleware checks against `ctx.permissions`.
4. **Middleware before routers**: Routers use `permittedProcedure()`.
5. **API routers before UI**: The UI `PermissionProvider` calls `auth.getMyPermissions`.
6. **Seed + migration before existing code breaks**: The migration must backfill `roleId` before the app code expects it.
7. **Session invalidation last**: Old session tokens lack `roleId`. Invalidate after deployment.

## Verification Checklist (Per PR)

### PR 1 Verification
- [ ] `tsc --noEmit` passes across all packages
- [ ] `drizzle-kit generate` produces a valid migration
- [ ] Migration applies cleanly (up and down)
- [ ] Roles are seeded with correct permission sets
- [ ] Existing users have `role_id` backfilled

### PR 2 Verification
- [ ] `tsc --noEmit` passes
- [ ] tRPC context returns `role` and `permissions` for authenticated users
- [ ] `requirePermissions("leads:read")` allows users with `leads:read` permission
- [ ] `requirePermissions("leads:delete")` blocks a Caller (who only has `leads:read`)
- [ ] Unauthenticated requests get `UNAUTHORIZED`
- [ ] Admin with `"*"` passes all checks

### PR 3 Verification
- [ ] `tsc --noEmit` passes
- [ ] `<Can permission="leads:create">` renders for Admin, hides for Caller
- [ ] Sign-up form sends `roleId` and account gets the correct role
- [ ] Old session tokens rejected after invalidation
- [ ] New login produces session with `roleId`
