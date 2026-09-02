# Roles and Permissions — Detailed Design

> **Change**: `roles-and-permissions`
> **Status**: Designed
> **Author**: SDD executor
> **Date**: 2026-06-14
> **Based on spec**: `openspec/changes/roles-and-permissions/spec.md`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Change Inventory](#2-file-change-inventory)
3. [Phase 1: DB Schema + Types](#3-phase-1-db-schema--types)
4. [Phase 2: Auth Config](#4-phase-2-auth-config-better-auth)
5. [Phase 3: API Context](#5-phase-3-api-context)
6. [Phase 4: API Middleware](#6-phase-4-api-middleware)
7. [Phase 5: API Routers](#7-phase-5-api-routers)
8. [Phase 6: UI Components + Hooks](#8-phase-6-ui-components--hooks)
9. [Phase 7: Migration + Seed](#9-phase-7-migration--seed)
10. [Phase 8: Session Invalidation](#10-phase-8-session-invalidation)
11. [Breaking Changes Reference](#appendix-a-breaking-changes-reference)
12. [Testing Checklist](#appendix-b-testing-checklist)

---

## 1. Architecture Overview

```
┌──────────────────────────┐
│       Browser (Next.js)   │
│  ┌──────────────────────┐ │
│  │ <Can> / usePermissions│ │
│  │ useRole()            │ │
│  └──────────┬───────────┘ │
│             │ tRPC client │
└─────────────┼─────────────┘
              │ HTTP /api/trpc
┌─────────────┼─────────────┐
│  Next.js API Routes       │
│  ┌──────────┴───────────┐ │
│  │ createContext()       │ │
│  │  ├─ getSession()      │ │
│  │  └─ resolveRole()     │ │
│  │     → role + perms    │ │
│  └──────────┬───────────┘ │
│  ┌──────────┴───────────┐ │
│  │ requirePermissions()  │ │
│  │ permittedProcedure()  │ │
│  └──────────┬───────────┘ │
│  ┌──────────┴───────────┐ │
│  │ tRPC routers          │ │
│  │ (leads, deals, ...)   │ │
│  └──────────┬───────────┘ │
└─────────────┼─────────────┘
              │ Drizzle ORM
┌─────────────┼─────────────┐
│  PostgreSQL │ roles table  │
│             │ user.roleId  │
│             │ sessions     │
└────────────────────────────┘
```

### Data Flow

1. **Request arrives** → Next.js API route → `createContext()` called
2. **Session resolved** via Better Auth `getSession()` → `session.user.roleId` available
3. **Role resolved** → DB query `roles` table to get `permissions` array + role name
4. **Context enriched** → `ctx.role: ResolvedRole | null`, `ctx.permissions: Permission[]`
5. **Middleware checks** → `requirePermissions(...)` validates against `ctx.permissions`
6. **Procedure runs** → only if permission check passes
7. **Client side** → `usePermissions()` hook reads from either tRPC query or context

### Key Principles

- **Fail closed**: no context/role → no permissions → denied
- **Wildcards cascade**: `"*"` grants everything, `"leads:*"` grants all `leads:xxx`
- **Schema drives everything**: the DB schema change to drop `role` column is the final step after backfill
- **Session invalidation is mandatory**: old tokens carry the `role` field; force logout ensures clean state

---

## 2. File Change Inventory

| # | File | Action | Phase |
|---|---|---|---|
| 1 | `packages/db/src/schema/auth.ts` | **Modify** — drop `role` col, add `$default()` on `roleId`, add `rolesRelations`, add `Permission`/`ResolvedRole` types | 1 |
| 2 | `packages/db/src/schema/index.ts` | **Verify** — no change needed (already `export *`) | 1 |
| 3 | `packages/auth/src/index.ts` | **Modify** — replace `role` with `roleId` in `additionalFields` | 2 |
| 4 | `packages/api/src/context.ts` | **Modify** — resolve role + permissions from DB, add to context | 3 |
| 5 | `packages/api/src/permissions.ts` | **NEW** — `Permission` type, `requirePermissions()` middleware, `permittedProcedure()` builder | 4 |
| 6 | `packages/api/src/routers/leads.ts` | **NEW** — example router with permission gates | 5 |
| 7 | `packages/api/src/routers/index.ts` | **Modify** — register leads router, optionally update existing procedures | 5 |
| 8 | `packages/ui/src/permissions/index.ts` | **NEW** — barrel export for permission components | 6 |
| 9 | `packages/ui/src/permissions/can.tsx` | **NEW** — `<Can>` conditional render component | 6 |
| 10 | `packages/ui/src/permissions/use-permissions.ts` | **NEW** — `usePermissions()` hook | 6 |
| 11 | `packages/ui/src/permissions/use-role.ts` | **NEW** — `useRole()` hook | 6 |
| 12 | `packages/ui/src/permissions/auth-context.tsx` | **NEW** — `PermissionProvider` React context | 6 |
| 13 | `apps/web/src/components/providers.tsx` | **Modify** — wrap with `PermissionProvider` | 6 |
| 14 | `apps/web/src/lib/auth-client.ts` | **Modify** — update `inferAdditionalFields` for `roleId` | 6 |
| 15 | `apps/web/src/components/user-menu.tsx` | **Modify** — update any old `role` references | 6 |
| 16 | `apps/web/src/components/sign-up-form.tsx` | **Modify** — replace `role` with `roleId` in form | 6 |
| 17 | `packages/db/drizzle.config.ts` | **Verify** — ensure schema path includes all exports | 7 |
| 18 | `packages/db/src/seed.ts` | **NEW** — seed script for initial roles | 7 |
| 19 | Session invalidation script or manual SQL | **NEW** — force logout all users | 8 |

> **Total**: 14 files changed/created (6 modify + 8 new)

---

## 3. Phase 1: DB Schema + Types

### 3.1 `packages/db/src/schema/auth.ts`

**Why this file changes first**: The database schema is the source of truth. Every other layer (auth, API, UI) depends on the shape of `user` and `roles`. Changing the schema first means we can run migrations before anything else breaks. The `role` column must be dropped (phased through migration steps) and replaced by the already-existing `roleId` FK.

**Breaking change**: If any code anywhere reads `user.role`, it will break after this schema change. The migration will drop the column, not just remove it from the type.

#### Current code

```typescript
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, integer, json } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").$default(() => "caller").notNull(),     // ← TO DROP
  roleId: text("role_id").references(() => roles.id).notNull(), // ← no $default yet
  leadActive: text("lead_active"),
  scoring: integer("scoring"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  permissions: json("permissions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// ... session, account, verification unchanged ...

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  role: one(roles, {
    fields: [user.roleId],
    references: [roles.id],
  }),
}));

// rolesRelations is MISSING — there's no inverse relation from roles back to users
```

#### New code

```typescript
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, integer, json } from "drizzle-orm/pg-core";

// ──────────────────────────────────────────────
// TYPE EXPORTS — used across the entire stack
// These are TypeScript types only, not DB schema.
// They live here because the DB package is the
// lowest-level shared package; putting them here
// avoids circular deps with @crm-fran/api.
// ──────────────────────────────────────────────

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

export type ResolvedRole = {
  id: string;
  name: string;
  permissions: Permission[];
};

// ──────────────────────────────────────────────
// USER TABLE — the main change
// ──────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // REMOVED: role: text("role").$default(() => "caller").notNull(),
  roleId: text("role_id")
    .references(() => roles.id)
    .$default(() => "role-caller")          // ← ADDED: Drizzle-level default
    .notNull(),
  leadActive: text("lead_active"),
  scoring: integer("scoring"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// ──────────────────────────────────────────────
// ROLES TABLE — unchanged
// ──────────────────────────────────────────────

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  permissions: json("permissions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// ──────────────────────────────────────────────
// SESSION, ACCOUNT, VERIFICATION — unchanged
// ──────────────────────────────────────────────

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ──────────────────────────────────────────────
// RELATIONS
// ──────────────────────────────────────────────

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  role: one(roles, {
    fields: [user.roleId],
    references: [roles.id],
  }),
}));

// ★ NEW: Inverse relation — roles → users
// This lets you do db.query.roles.findMany({ with: { users: true } })
// to find all users with a given role. Not critical for v1, but
// important for admin panels and Drizzle query completeness.
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(user),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
```

**Educational note on `$default()` vs DB-level `default()`**:
- `$default()` is a **Drizzle client-side default** — it runs in your application code, not at the DB level. This means `INSERT INTO "user" ...` without specifying `roleId` will get `"role-caller"` when using Drizzle ORM, but a raw SQL insert would not get the default.
- A DB-level `default()` would add a column default in PostgreSQL. The spec doesn't require DB-level default because the $default() + migration backfill covers all cases.

**What about the `permissions` column type?** It's `json("permissions")`, which means PostgreSQL stores it as JSON. Drizzle will type it as `unknown | null` when reading. You need to cast it to `Permission[]` at runtime (we do this in `context.ts`).

### 3.2 `packages/db/src/schema/index.ts`

**Current code**:
```typescript
export * from "./auth";
export {};
```

**New code**: No change needed. The `export * from "./auth"` re-exports everything including the new `rolesRelations`, `Permission` type, and `ResolvedRole` type. The `export {}` is a module-enhancement pattern (likely for ambient types). Keep as-is.

**Why no change?** The barrel file already does `export *`. The only reason to change would be if we wanted explicit named exports or separate file organization. Since `auth.ts` is the natural home for auth-related schema, keep the barrel simple.

---

## 4. Phase 2: Auth Config (Better Auth)

### 4.1 `packages/auth/src/index.ts`

**Why this file changes**: Better Auth reads the `additionalFields` config to know which columns on the `user` table it should manage. Currently it knows about `role`, but after Phase 1 the `role` column won't exist. We must tell Better Auth about `roleId` instead so it:
1. Reads `roleId` from the session query
2. Writes `roleId` during sign-up (when `input: true`)
3. Includes `roleId` in the session user object returned by `getSession()`

**Breaking change**: `session.user.role` will no longer exist. Any client code accessing `session.user.role` will get `undefined` at runtime and a TS error.

#### Current code

```typescript
import { createDb } from "@crm-fran/db";
import * as schema from "@crm-fran/db/schema/auth";
import { env } from "@crm-fran/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    user: {
      additionalFields: {
        role: {                         // ← OLD: being removed
          type: "string",
          input: true,
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
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

export const auth = createAuth();
```

#### New code

```typescript
import { createDb } from "@crm-fran/db";
import * as schema from "@crm-fran/db/schema/auth";
import { env } from "@crm-fran/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    user: {
      additionalFields: {
        roleId: {                       // ← NEW: replaces `role`
          type: "string",
          input: true,                  // Allow setting during sign-up
          required: true,               // Every user must have a role
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
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

export const auth = createAuth();
```

**Educational note on `required: true`**: Setting `required: true` in Better Auth's `additionalFields` means:
- The field is marked as NOT NULL at the ORM level (already true from schema)
- Better Auth will reject sign-up requests that don't include this field
- This is **good** — every user must have a role, and `$default(() => "role-caller")` in Drizzle means if the client doesn't send `roleId`, Drizzle will fill it in. However, Better Auth's validation runs before the DB insert, so `required: true` means the client **must** send `roleId`. If you want the server-side default to apply, set `required: false` and `default: "role-caller"` here. Let me explain the tradeoff:

**Decision: Use `required: false` + Drizzle `$default()` instead.** Here's why:

```typescript
// packages/auth/src/index.ts — RECOMMENDED final version
additionalFields: {
  roleId: {
    type: "string",
    input: true,
    required: false,        // ← false, so Drizzle $default can fill it
    defaultValue: "role-caller",  // ← Better Auth-level default as safety net
  },
  ...
}
```

This way:
1. If the sign-up form sends `roleId: "role-closer"`, it's used
2. If the sign-up form sends nothing (or empty), Better Auth sees `undefined` and doesn't reject it; Drizzle's `$default(() => "role-caller")` kicks in
3. The `defaultValue` in Better Auth config acts as a second safety net

**But wait** — Better Auth's `defaultValue` is the fallback if the field is not provided and `required: false`. Let me check the spec again. The spec says:

> **Scenario**: New user sign-up sets roleId — the session user object MUST contain `roleId: "role-caller"`

This implies that the default is applied server-side. Using `required: false` + `defaultValue: "role-caller"` in Better Auth config is the correct approach. This ensures:

```typescript
user: {
  additionalFields: {
    roleId: {
      type: "string",
      input: true,
      required: false,
      defaultValue: "role-caller",
    },
    ...
  },
},
```

---

## 5. Phase 3: API Context

### 5.1 `packages/api/src/context.ts`

**Why this file changes**: Currently, the context only passes through the session object. We need to enrich it with the resolved role and permissions so that middleware can check them without making separate DB queries. This is the **single point** where role resolution happens for the API layer.

**Design decision — resolve role eagerly vs lazily**: We resolve the role eagerly in `createContext()` because:
- Every authenticated request will likely need the role/permissions anyway
- It keeps the middleware simple (just array checks)
- One DB query per request is acceptable for v1 (PostgreSQL can handle this)
- If performance becomes an issue, we can cache the resolved role in the session JWT later

#### Current code

```typescript
import { auth } from "@crm-fran/auth";
import type { NextRequest } from "next/server";

export async function createContext(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    auth: null,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

#### New code

```typescript
import { auth } from "@crm-fran/auth";
import { createDb } from "@crm-fran/db";
import type { Permission, ResolvedRole } from "@crm-fran/db/schema/auth";
import type { NextRequest } from "next/server";

export async function createContext(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  // Resolve role and permissions from the database
  let role: ResolvedRole | null = null;
  let permissions: Permission[] = [];

  if (session?.user?.roleId) {
    const db = createDb();
    const userRole = await db.query.roles.findFirst({
      where: (roles, { eq }) => eq(roles.id, session.user.roleId),
    });

    if (userRole) {
      // The permissions column is JSON in PostgreSQL.
      // Drizzle types it as `unknown | null` when using json().
      // We cast it safely to Permission[].
      const rawPermissions = userRole.permissions as unknown;
      const parsedPermissions = Array.isArray(rawPermissions)
        ? (rawPermissions as Permission[])
        : [];

      role = {
        id: userRole.id,
        name: userRole.name,
        permissions: parsedPermissions,
      };
      permissions = parsedPermissions;
    }
  }

  return {
    session,
    role,                    // ResolvedRole | null
    permissions,             // Permission[]  (empty if no session or no role)
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

**Educational notes**:

1. **Why `createDb()` inside the handler?** The `createDb()` function from `@crm-fran/db` creates a new Drizzle client instance. In a serverless environment (Next.js API routes), you generally want a singleton db instance. However, looking at `packages/db/src/index.ts`:

   ```typescript
   export function createDb() {
     return drizzle(env.DATABASE_URL, { schema });
   }
   export const db = createDb();
   ```

   There's already a singleton `db` export. We could import `db` directly. But `createDb()` gives us flexibility if we need a fresh connection (e.g., per-request transaction). For simplicity, import the singleton `db`:

   ```typescript
   import { db } from "@crm-fran/db";  // simpler
   ```

   Let's use the singleton. It's already imported in `packages/auth/src/index.ts` the same way.

2. **Why `as unknown` then `as Permission[]`?** Drizzle's `json()` column type returns `unknown` at the type level. You must cast it. Using `Array.isArray()` as a runtime guard ensures we don't crash if a role's permissions column is somehow null or malformed.

3. **Why `session?.user?.roleId` instead of `session?.user?.role`?** After Phase 2, Better Auth no longer returns `role`. It returns `roleId`. This is a breaking change — any code that reads `session.user.role` will break.

#### Updated import using the singleton

```typescript
import { auth } from "@crm-fran/auth";
import { db } from "@crm-fran/db";                         // ← singleton import
import type { Permission, ResolvedRole } from "@crm-fran/db/schema/auth";
import type { NextRequest } from "next/server";

export async function createContext(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  let role: ResolvedRole | null = null;
  let permissions: Permission[] = [];

  if (session?.user?.roleId) {
    const userRole = await db.query.roles.findFirst({
      where: (roles, { eq }) => eq(roles.id, session.user.roleId),
    });

    if (userRole) {
      const rawPermissions = userRole.permissions as unknown;
      const parsedPermissions = Array.isArray(rawPermissions)
        ? (rawPermissions as Permission[])
        : [];

      role = {
        id: userRole.id,
        name: userRole.name,
        permissions: parsedPermissions,
      };
      permissions = parsedPermissions;
    }
  }

  return {
    session,
    role,
    permissions,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

---

## 6. Phase 4: API Middleware

### 6.1 `packages/api/src/permissions.ts` (NEW FILE)

**Why this file is new**: The spec requires a middleware factory `requirePermissions(...)` and a convenience builder `permittedProcedure(...)`. These are the permission enforcement points. They live in `@crm-fran/api` because they depend on tRPC (`TRPCError`, `t.procedure`).

**Design decisions**:

1. **Wildcard matching**: `"*"` → grants everything (admin). `"domain:*"` → grants all actions in that domain. The middleware checks both direct match and domain wildcard.

2. **Why `requirePermissions(...)` as varargs?** Using rest params means you can call it as `requirePermissions("leads:read", "leads:write")` to require multiple permissions. This is more natural than passing an array.

3. **Why a separate `permittedProcedure`?** It's a syntactic sugar that composes `protectedProcedure` (authentication check) with permission check. This way you don't need to stack middleware yourself.

```typescript
// packages/api/src/permissions.ts

import { TRPCError } from "@trpc/server";
import { t } from "./index";
import type { Permission } from "@crm-fran/db/schema/auth";

/**
 * Middleware factory that checks the current user's permissions.
 *
 * Usage:
 *   const adminOnly = requirePermissions("users:write", "settings:write");
 *   const leadsRead = requirePermissions("leads:read");
 *
 * Wildcard behavior:
 *   - User has ["*"]           → ALL checks pass (admin)
 *   - User has ["leads:*"]     → "leads:read", "leads:write", etc. pass
 *   - User has ["leads:read"]  → only "leads:read" passes
 */
export function requirePermissions(...required: Permission[]) {
  return t.middleware(({ ctx, next }) => {
    // ── Authentication check ──
    if (!ctx.session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Super-admin wildcard ──
    // If the user has ["*"], they can do anything.
    // This is checked first for efficiency.
    if (ctx.permissions.includes("*")) {
      return next({ ctx });
    }

    // ── Individual permission check ──
    // For each required permission, we check:
    //   1. Direct match: ctx.permissions.includes(req)
    //   2. Domain wildcard: if req is "leads:read", check "leads:*"
    const hasAll = required.every((req) => {
      // Direct match
      if (ctx.permissions.includes(req)) return true;

      // Domain wildcard match
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

/**
 * Convenience procedure builder that combines authentication + permission check.
 *
 * Usage:
 *   const leadsRead = permittedProcedure("leads:read");
 *   const leadsWrite = permittedProcedure("leads:write");
 *
 *     leadsRead.query(() => { ... });
 *     leadsWrite.mutation(({ input }) => { ... });
 */
export function permittedProcedure(permissions: Permission[]) {
  return t.procedure.use(requirePermissions(...permissions));
}
```

**Educational note on `t.middleware` vs `t.procedure.use`**:

- `t.middleware` creates a middleware function that you can reuse and compose
- `t.procedure.use(...)` applies middleware to a specific procedure
- `requirePermissions(...)` returns a middleware (t.middleware)
- `permittedProcedure(...)` creates a new procedure builder with the middleware already applied
- Both approaches work; `permittedProcedure` is syntactic sugar for the common case

**Edge case: What if `ctx.permissions` is empty?** The `every()` on an empty array returns `true`. So `permittedProcedure([])` would pass every check. But that's fine — you'd never call it with an empty array in practice. And if someone does, they'll confuse themselves but it won't be a security hole (they're just not requiring anything).

**Edge case: What about unauthenticated users?** The middleware checks `!ctx.session` first and throws `UNAUTHORIZED`. So `permittedProcedure(...)` always requires authentication. This is intentional — you shouldn't ever need to check permissions for unauthenticated users.

---

## 7. Phase 5: API Routers

### 7.1 `packages/api/src/routers/index.ts`

**Why this file changes**: We need to register the new `leadsRouter` in the app router. The existing `privateData` procedure is a good candidate to show how to upgrade from `protectedProcedure` to `permittedProcedure`.

#### Current code

```typescript
import { protectedProcedure, publicProcedure, router } from "../index";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
});
export type AppRouter = typeof appRouter;
```

#### New code

```typescript
import { publicProcedure, router } from "../index";
import { permittedProcedure } from "../permissions";
import { leadsRouter } from "./leads";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  // ★ Upgraded: was protectedProcedure, now explicitly requires "profile:read"
  // (since privateData returns user info, profile:read is appropriate)
  privateData: permittedProcedure(["profile:read"]).query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
      role: ctx.role,
      permissions: ctx.permissions,
    };
  }),
  // ★ New leads router
  leads: leadsRouter,
});
export type AppRouter = typeof appRouter;
```

**Why change `privateData` to use `permittedProcedure`?** It demonstrates the pattern. The old `protectedProcedure` just checked auth; the new one checks auth + permissions. If you want a "just auth, no permission" procedure, you can keep `protectedProcedure` or create a `requireAuth` middleware. But the spec's direction is that all protected routes should declare their minimum permission.

**Alternative**: Keep the existing `protectedProcedure` as-is and only use `permittedProcedure` for new routes. This is less disruptive. The spec says "All existing and future tRPC procedures that access protected resources MUST use `requirePermissions(...)` or `permittedProcedure(...)`". So we should migrate existing ones.

### 7.2 `packages/api/src/routers/leads.ts` (NEW FILE)

**Why this file is new**: This is the first domain router that uses permissions. It demonstrates the pattern for all future domain routers.

```typescript
// packages/api/src/routers/leads.ts

import { z } from "zod";
import { permittedProcedure } from "../permissions";
import { router } from "../index";

export const leadsRouter = router({
  list: permittedProcedure(["leads:read"]).query(async ({ ctx }) => {
    // TODO: implement actual DB query
    return [];
  }),

  getById: permittedProcedure(["leads:read"])
    .input(z.string())
    .query(async ({ ctx, input }) => {
      // TODO: implement actual DB query
      return null;
    }),

  create: permittedProcedure(["leads:write"])
    .input(
      z.object({
        name: z.string(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: implement actual DB query
      return { id: "new-lead-id", ...input };
    }),

  update: permittedProcedure(["leads:write"])
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: implement actual DB query
      return { ...input };
    }),

  delete: permittedProcedure(["leads:delete"])
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      // TODO: implement actual DB query (soft delete)
      return { success: true };
    }),
});
```

**Educational note**: Each procedure explicitly declares its minimum permission. This makes the API self-documenting — you can look at a procedure and know exactly who can call it.

---

## 8. Phase 6: UI Components + Hooks

### 8.1 Design of the Permission Context

The client needs a way to know the current user's permissions for conditional rendering. There are two approaches:

**Option A: Dedicated tRPC query**
- Create `auth.getMyPermissions` procedure
- Call it once on app load
- Store in React Query cache
- Simple, but requires a round trip

**Option B: Session context enrichment**
- Create a `PermissionProvider` React context
- On mount, read the session from `authClient.useSession()`
- If session exists, call the tRPC query to resolve permissions
- Expose via `usePermissions()` and `useRole()` hooks

**Decision**: Option B (context + tRPC query). This is the standard React pattern:
1. `PermissionProvider` wraps the app
2. It uses the `authClient.useSession()` to know if user is authenticated
3. If authenticated, it calls a lightweight tRPC query (`auth.getMyPermissions`)
4. Results are stored in React context
5. `usePermissions()` and `useRole()` hooks consume the context

**Why not just use session.user.roleId directly?** Because the session only has `roleId` (the FK), not the resolved permissions array. We need to resolve `roleId → permissions` from the DB, and we don't want to put the full permissions array in the JWT (it would make tokens large). So we resolve on the server via tRPC.

### 8.2 New API: `auth.getMyPermissions`

Before we build the UI, we need a way for the client to resolve permissions. Let's add a procedure to get permissions for the current user.

#### `packages/api/src/routers/auth.ts` (NEW FILE)

```typescript
// packages/api/src/routers/auth.ts

import { permittedProcedure } from "../permissions";
import { router } from "../index";

export const authRouter = router({
  getMyPermissions: permittedProcedure([]).query(({ ctx }) => {
    // permittedProcedure([]) requires auth but no specific permission.
    // This is intentionally permissive — every authenticated user should
    // be able to see their own permissions.
    return {
      role: ctx.role,
      permissions: ctx.permissions,
    };
  }),
});
```

**Why `permittedProcedure([])` vs `protectedProcedure`?** The empty array means "authenticated, but no specific permission required." This is a useful pattern for "just check auth" procedures. We could also create a dedicated `authenticatedProcedure` for clarity.

#### Update `packages/api/src/routers/index.ts` to include auth router

```typescript
import { publicProcedure, router } from "../index";
import { permittedProcedure } from "../permissions";
import { authRouter } from "./auth";
import { leadsRouter } from "./leads";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: permittedProcedure(["profile:read"]).query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
      role: ctx.role,
      permissions: ctx.permissions,
    };
  }),
  auth: authRouter,
  leads: leadsRouter,
});
export type AppRouter = typeof appRouter;
```

### 8.3 `packages/ui/src/permissions/auth-context.tsx` (NEW FILE)

```typescript
// packages/ui/src/permissions/auth-context.tsx

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Permission, ResolvedRole } from "@crm-fran/db/schema/auth";

// ── Types ──

export type PermissionState = {
  role: ResolvedRole | null;
  permissions: Permission[];
  isLoaded: boolean;     // true after first resolution attempt
  isLoading: boolean;    // true while currently resolving
  error: Error | null;
};

// ── Context ──

const PermissionContext = createContext<PermissionState>({
  role: null,
  permissions: [],
  isLoaded: false,
  isLoading: false,
  error: null,
});

// ── Provider ──
// This provider does NOT make the tRPC call itself. It relies on a
// callback prop (or we can use the TRPCOptionsProxy pattern). For
// maximum flexibility, we accept a `resolvePermissions` function.
//
// But actually, let's use the tRPC client directly since we have it.
// The provider is meant to be used inside the QueryClientProvider.

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
    let cancelled = false;

    async function load() {
      try {
        const result = await resolvePermissions();
        if (!cancelled) {
          setState({
            role: result.role,
            permissions: result.permissions,
            isLoaded: true,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            role: null,
            permissions: [],
            isLoaded: true,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }

    load();

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

// ── Hooks ──

export function usePermissionState(): PermissionState {
  return useContext(PermissionContext);
}

export function usePermissions(): Permission[] {
  return useContext(PermissionContext).permissions;
}

export function useRole(): ResolvedRole | null {
  return useContext(PermissionContext).role;
}
```

### 8.4 `packages/ui/src/permissions/index.ts` (NEW FILE)

```typescript
// packages/ui/src/permissions/index.ts

export {
  PermissionProvider,
  usePermissionState,
  usePermissions,
  useRole,
} from "./auth-context";
export { Can } from "./can";
export type { PermissionState } from "./auth-context";
```

### 8.5 `packages/ui/src/permissions/can.tsx` (NEW FILE)

```typescript
// packages/ui/src/permissions/can.tsx

"use client";

import { usePermissions } from "./auth-context";
import type { Permission } from "@crm-fran/db/schema/auth";

/**
 * Conditional render component based on permissions.
 *
 * Usage:
 *   <Can permission="leads:create">
 *     <button>New Lead</button>
 *   </Can>
 *
 *   <Can permission="leads:delete" fallback={<span>No access</span>}>
 *     <button>Delete</button>
 *   </Can>
 *
 * Wildcard behavior:
 *   - User has "*"               → always renders children
 *   - User has "leads:*"         → renders for "leads:read", "leads:write", etc.
 *   - User has "leads:read"      → renders only for "leads:read"
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

  // Super-admin wildcard
  if (permissions.includes("*")) return <>{children}</>;

  // Direct match
  if (permissions.includes(permission)) return <>{children}</>;

  // Domain wildcard: if permission is "leads:read", check for "leads:*"
  const [domain] = permission.split(":");
  if (domain && permissions.includes(`${domain}:*`)) return <>{children}</>;

  // Fallback (default: null — hidden entirely)
  return <>{fallback}</>;
}
```

**Why no disabled/tooltip UI fallback?** The spec says: "UI fallback: hidden entirely (no disabled/tooltip)". This is a deliberate product decision — users should not see UI elements they can't use. Disabled buttons create confusion ("why can't I click this?"). Hidden elements are cleaner.

### 8.6 `apps/web/src/components/providers.tsx`

**Why this file changes**: We need to add the `PermissionProvider` to the React tree. The `PermissionProvider` needs a `resolvePermissions` function that calls the tRPC `auth.getMyPermissions` query. We'll pass it via a closure that uses the already-configured `trpc` client.

#### Current code

```tsx
"use client";

import { Toaster } from "@crm-fran/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools />
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
```

#### New code

```tsx
"use client";

import { Toaster } from "@crm-fran/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PermissionProvider } from "@crm-fran/ui/permissions";

import { queryClient, trpc } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <PermissionProvider
          resolvePermissions={async () => {
            // Use the tRPC client to fetch permissions.
            // Note: we use the raw client directly (not via React Query hooks)
            // because this is called inside the provider setup, not in a component.
            const result = await trpc.auth.getMyPermissions.query();
            return result;
          }}
        >
          {children}
          <ReactQueryDevtools />
        </PermissionProvider>
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
```

**Educational note on `trpc.auth.getMyPermissions.query()`**: The `trpc` export from `@/utils/trpc` is a `createTRPCOptionsProxy` (TRPC v11's TanStack React Query proxy), not a raw client. Calling `.query()` on it may not work as expected — it actually returns query options, not a promise directly. Let me verify this.

Looking at `apps/web/src/utils/trpc.ts`:

```typescript
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
```

`createTRPCOptionsProxy` returns an object where each router method returns React Query options objects, not raw promises. To make a direct query from outside a component (like in the provider), we need the raw client that's stored inside `trpcClient`. So we need to export the raw client or use a different approach.

**Better approach**: Export the raw tRPC client separately and use it in the PermissionProvider:

```typescript
// apps/web/src/utils/trpc.ts — add this export
export { trpcClient };  // the raw client for server-side calls
```

Then in providers:

```typescript
import { queryClient, trpcClient } from "@/utils/trpc";

// Inside PermissionProvider:
resolvePermissions={async () => {
  const result = await trpcClient.auth.getMyPermissions.query();
  return result;
}}
```

**Even better approach**: Use a React Query query inside a component that wraps the PermissionProvider. But that creates a chicken-and-egg problem (you need permissions to render, but you need to render to query). The `PermissionProvider` is the right place — it's essentially a "bootstrapping" loader.

**Alternative (simpler)**: Skip the PermissionProvider entirely and have `usePermissions()` / `useRole()` call the tRPC query internally via React Query's `useQuery`. This is simpler and more idiomatic with TanStack Query:

```typescript
// packages/ui/src/permissions/use-permissions.ts
"use client";
import { useQuery } from "@tanstack/react-query";

export function usePermissions() {
  const { data } = useQuery({
    queryKey: ["auth", "myPermissions"],
    queryFn: () => trpcClient.auth.getMyPermissions.query(),
    staleTime: 5 * 60 * 1000, // 5 min — permissions rarely change
  });

  return data?.permissions ?? [];
}
```

But this has a problem: `useQuery` can't be called outside a React component, and `usePermissions` needs to be callable from the `<Can>` component which is a React component. So this works! But it means every `<Can>` component would trigger this query. React Query deduplicates by `queryKey`, so it's fine.

**Decision**: Let's go with the context + lazy query approach. It's cleaner:

1. `PermissionProvider` uses `authClient.useSession()` to detect auth state
2. If authenticated, it calls a resolve function (tRPC query)
3. Stores result in context
4. `<Can>`, `usePermissions()`, `useRole()` read from context

The resolve function is passed as a prop so the provider package doesn't depend on tRPC directly.

But actually, let me simplify. Let's define the PermissionProvider to manage the loading pattern naturally:

```tsx
// packages/ui/src/permissions/auth-context.tsx

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Permission, ResolvedRole } from "@crm-fran/db/schema/auth";

export type PermissionState = {
  role: ResolvedRole | null;
  permissions: Permission[];
  isLoaded: boolean;
  isLoading: boolean;
  error: Error | null;
};

const PermissionContext = createContext<PermissionState>({
  role: null,
  permissions: [],
  isLoaded: false,
  isLoading: false,
  error: null,
});

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
    let cancelled = false;

    async function load() {
      try {
        const result = await resolvePermissions();
        if (!cancelled) {
          setState({
            role: result.role,
            permissions: result.permissions,
            isLoaded: true,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            role: null,
            permissions: [],
            isLoaded: true,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }

    load();

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

export function usePermissionState(): PermissionState {
  return useContext(PermissionContext);
}

export function usePermissions(): Permission[] {
  return useContext(PermissionContext).permissions;
}

export function useRole(): ResolvedRole | null {
  return useContext(PermissionContext).role;
}
```

And in providers.tsx, we pass the resolve function that uses the tRPC client.

### 8.7 `apps/web/src/lib/auth-client.ts`

**Why this file changes**: The `inferAdditionalFields` plugin infers the session user type from the server `auth` object. Since we changed `additionalFields` to use `roleId` instead of `role`, the inferred type will automatically update. But we need to verify the type is correct.

#### Current code

```typescript
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@crm-fran/auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
```

#### New code

No code change needed! The `inferAdditionalFields<typeof auth>()` will automatically infer the new `roleId` field from the server config. The type of `authClient.$Infer.Session.user` will now include `roleId: string` instead of `role: string`.

**But we should verify**: After making changes, run `pnpm exec tsc --noEmit` to check that type references to `session.user.role` are flagged. Any code that accessed `session.user.role` will now fail to compile.

### 8.8 `apps/web/src/components/user-menu.tsx`

**Why this file changes**: The UserMenu currently uses `session.user.role` (implicitly — it accesses `session.user.name` and `session.user.email`, so it doesn't actually use `role`). But after the change, we might want to show the user's role name in the menu. Let's check what it currently does.

#### Current code

```tsx
"use client";

import { Button } from "@crm-fran/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm-fran/ui/components/dropdown-menu";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Link href="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                  },
                },
              });
            }}
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Actually, this component doesn't use `session.user.role` at all. So it won't break from the schema change. But we could enhance it to show the user's role name from the permission context. That's optional.

**Suggested enhancement** (optional): Add role name display using `useRole()`:

```tsx
// ... inside the DropdownMenu:
<DropdownMenuLabel>
  {session.user.name}
</DropdownMenuLabel>
<DropdownMenuSeparator />
<DropdownMenuItem className="text-muted-foreground">
  {session.user.email}
</DropdownMenuItem>
<DropdownMenuItem disabled className="text-xs">
  {useRole()?.name ?? "Unknown role"}
</DropdownMenuItem>
```

But this is an enhancement, not a requirement. The core requirement is just that it doesn't break.

### 8.9 `apps/web/src/components/sign-up-form.tsx`

**Why this file changes**: The sign-up form currently sends `role` to the Better Auth sign-up API. After the change, Better Auth expects `roleId`.

#### Current code (relevant section)

```tsx
// The form field
<form.Field name="role">
  ...
    <SelectItem value="caller">Caller</SelectItem>
    <SelectItem value="admin">Admin</SelectItem>
    <SelectItem value="closer">Close</SelectItem>
  ...
</form.Field>

// The submit
authClient.signUp.email(
  {
    email: value.email,
    password: value.password,
    name: value.name,
    role: value.role as "caller" | "admin" | "closer"
  },
  ...
);
```

#### New code

```tsx
// Change the form field name from "role" to "roleId"
<form.Field name="roleId">
  {(field) => (
    <div className="space-y-2">
      <Label htmlFor={field.name}>Role</Label>
      <Select
        id={field.name}
        name={field.name}
        value={field.state.value}
        onValueChange={(value) =>
          field.handleChange(value ?? "role-caller")
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="role-caller">Caller</SelectItem>
          <SelectItem value="role-admin">Admin</SelectItem>
          <SelectItem value="role-closer">Closer</SelectItem>
        </SelectContent>
      </Select>
      {field.state.meta.errors.map((error) => (
        <p key={error?.message} className="text-red-500">
          {error?.message}
        </p>
      ))}
    </div>
  )}
</form.Field>

// Change the submit payload to use roleId
authClient.signUp.email(
  {
    email: value.email,
    password: value.password,
    name: value.name,
    roleId: value.roleId as "role-caller" | "role-admin" | "role-closer"
  },
  ...
);

// Update the default values
const form = useForm({
  defaultValues: {
    email: "",
    password: "",
    name: "",
    roleId: "role-caller" as string  // ← changed default
  },
  ...
  validators: {
    onSubmit: z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.email("Invalid email address"),
      password: z.string().min(8, "Password must be at least 8 characters"),
      roleId: z.string().min(1, "Role is required"),
    }),
  },
});
```

**Educational note on value change**: The old form values were `"caller"`, `"admin"`, `"closer"` — the old text values for the `role` column. The new values are `"role-caller"`, `"role-admin"`, `"role-closer"` — the FK values for the `roleId` column that correspond to `roles.id`. This is the whole point of the change: going from arbitrary text to referential integrity.

---

## 9. Phase 7: Migration + Seed

### 9.1 Migration Strategy

The migration is the most delicate part because:
1. It must run against a production database with existing users
2. It must handle edge cases (unmapped roles, null roleId)
3. It must preserve data

**We have two approaches**:

**Approach A: Drizzle migration file** (recommended)
- Run `drizzle-kit generate` after schema changes
- Drizzle will detect the removed `role` column and added `$default()` on `roleId`
- Write a custom migration file for data backfill
- Apply via `drizzle-kit migrate`

**Approach B: Separate seed script**
- Create a Node.js script `packages/db/src/seed.ts`
- Run it manually or as part of deployment
- Does the seeding and backfill before the DDL migration runs

**Decision**: Use **both** — Drizzle migration for DDL (column drop), and a seed script for data (role inserts + backfill). The seed script must run before the DDL migration that drops the `role` column.

### 9.2 Seed Script: `packages/db/src/seed.ts` (NEW FILE)

```typescript
// packages/db/src/seed.ts
//
// Run: npx tsx packages/db/src/seed.ts
// This must run BEFORE the migration that drops the `role` column.

import { db } from "./index";
import { roles, user } from "./schema/auth";
import { eq, and, isNull, not, inArray } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding roles...");

  // ── Step 1: Upsert roles ──
  // We use onConflictDoNothing so re-running the seed is safe.
  await db
    .insert(roles)
    .values([
      {
        id: "role-caller",
        name: "Caller",
        permissions: ["leads:read", "leads:write", "profile:read", "profile:write"],
      },
      {
        id: "role-closer",
        name: "Closer",
        permissions: ["leads:*", "deals:*", "reports:read", "profile:*"],
      },
      {
        id: "role-admin",
        name: "Admin",
        permissions: ["*"],
      },
    ])
    .onConflictDoNothing({ target: roles.id });

  console.log("✅ Roles seeded (or already existed).");

  // ── Step 2: Backfill roleId for existing users ──
  // Map old role strings to new role IDs.
  // Users with no role or unmapped role get "role-caller".

  const allUsers = await db.query.user.findMany();

  for (const u of allUsers) {
    if (u.roleId) {
      continue; // Already has a roleId set (e.g., from recent sign-ups)
    }

    let targetRoleId = "role-caller"; // Default fallback

    if (u.role === "caller") targetRoleId = "role-caller";
    else if (u.role === "closer") targetRoleId = "role-closer";
    else if (u.role === "admin") targetRoleId = "role-admin";
    // else: any other value maps to "role-caller" (safe default)

    await db
      .update(user)
      .set({ roleId: targetRoleId })
      .where(eq(user.id, u.id));

    console.log(`  ↳ User ${u.id}: role "${u.role}" → roleId "${targetRoleId}"`);
  }

  console.log("✅ All users backfilled with roleId.");
  console.log("🎉 Seed complete. You can now run 'drizzle-kit migrate' to drop the `role` column.");
}

seed()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

### 9.3 Migration Steps Order

Here's the exact sequence of operations:

```
Step 1: Edit schema → remove `role` column, add `$default()` on `roleId`, add `rolesRelations`
Step 2: Run `pnpm db:generate` → creates a migration file that ALTER TABLE DROP COLUMN role
Step 3: Run `pnpm tsx packages/db/src/seed.ts` → inserts roles, backfills roleId
Step 4: Run `pnpm db:migrate` → applies the DDL migration (drops `role` column)
Step 5: Invalidate all sessions (see Phase 8)
Step 6: Restart the app
```

**Important**: If you run `db:migrate` before the seed script, the `role` column will be dropped and you'll lose the data that maps old roles to new roleIds. The seed script reads the `role` column to do the mapping.

### 9.4 Handling the `$default()` in Migration

The `$default(() => "role-caller")` in the schema is a **client-side** default in Drizzle. It's applied by the Drizzle ORM when inserting new rows, not by PostgreSQL. The DB column won't have a SQL DEFAULT constraint.

This is fine because:
- New users go through Better Auth → Drizzle → `$default()` applies
- Existing users were backfilled in the seed script
- If a raw SQL insert happens without Drizzle, the FK constraint to `roles.id` will prevent an invalid roleId

If you want a DB-level default too, add it manually in the migration:

```sql
ALTER TABLE "user" ALTER COLUMN "role_id" SET DEFAULT 'role-caller';
```

But this is optional. The Drizzle-level `$default()` is sufficient.

---

## 10. Phase 8: Session Invalidation

### 10.1 Why Force Logout?

After the migration, old session tokens/JWTs will still contain the legacy `role` field (if Better Auth embeds custom fields in the JWT). When those users make requests, `auth.api.getSession()` might return the old data shape. Worse, the session query might fail because the `role` column no longer exists.

Better Auth stores sessions in the `session` table in PostgreSQL. The session data is looked up by token, and the `user` JOIN reads from the `user` table. Since we dropped the `role` column, the query should just not return `role` — but Better Auth might error if it tries to read that column.

**The safest approach**: Delete all session records after migration. This forces every user to log in again, at which point they get a fresh session with the correct `roleId` field.

### 10.2 Session Invalidation Script

```typescript
// scripts/invalidate-sessions.ts
// Run: npx tsx scripts/invalidate-sessions.ts

import { db } from "../packages/db/src/index";
import { session } from "../packages/db/src/schema/auth";

async function invalidateAllSessions() {
  console.log("🔄 Invalidating all sessions...");

  const result = await db.delete(session);

  console.log(`✅ Deleted ${result.count || 'all'} sessions. All users must re-login.`);
}

invalidateAllSessions()
  .catch((err) => {
    console.error("❌ Failed to invalidate sessions:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

### 10.3 Using Better Auth API (Alternative)

Better Auth might have a `revokeSession` or similar API. Check the docs for `auth.api.revokeSession()` or `auth.api.listSessions()` to do this more cleanly. But the direct DB delete is simpler and guaranteed to work.

**Risk**: Deleting sessions will force all users (including yourself) to log in. Make sure you have a way to log in before running this script!

---

## Appendix A: Breaking Changes Reference

Every piece of code that reads `user.role` or `session.user.role` must be updated. Here's a comprehensive grep:

| Search Pattern | Likely Files | Action |
|---|---|---|
| `session\.user\.role` | `user-menu.tsx`, `dashboard.tsx`, any component using session | Change to `session.user.roleId` or resolve via `useRole()` |
| `\.role\s` in DB queries | Any schema query filtering by `role` | Change to filter by `roleId` |
| `role:` as a field name in sign-up | `sign-up-form.tsx` | Change to `roleId` and use FK values |
| `"caller"` / `"admin"` / `"closer"` as role values | `sign-up-form.tsx`, seed scripts | Change to `"role-caller"` / `"role-admin"` / `"role-closer"` |
| `export type Permission` (if defined elsewhere) | Any custom permission types | Remove or re-export from `@crm-fran/db/schema/auth` |

### Migration Safety Checklist

- [ ] Grep for `user.role` across the entire monorepo
- [ ] Grep for `session.user.role` in all `apps/*`
- [ ] Grep for `.role === "caller"` etc. (string comparisons)
- [ ] Check `drizzle-kit generate` output before running it
- [ ] Back up the database before migration
- [ ] Test migration on a staging DB first

---

## Appendix B: Testing Checklist

### Unit Tests

| Test | File | What to Assert |
|---|---|---|
| `requirePermissions` matches direct permission | `packages/api/src/__tests__/permissions.test.ts` | Middleware calls next() |
| `requirePermissions` matches domain wildcard | same | `leads:*` grants `leads:read` |
| `requirePermissions` matches super-admin `*` | same | `*` grants everything |
| `requirePermissions` rejects missing permission | same | Throws FORBIDDEN |
| `requirePermissions` rejects unauthenticated | same | Throws UNAUTHORIZED |
| `requirePermissions` with empty array passes for authed | same | Calls next() |
| `Can` renders children when permission matches | `packages/ui/src/permissions/__tests__/can.test.tsx` | Children present |
| `Can` renders fallback when no permission | same | Fallback present, children absent |
| `Can` renders children with domain wildcard | same | `leads:*` grants `leads:read` |

### Integration Tests

| Test | What to Assert |
|---|---|
| New sign-up creates user with `roleId = "role-caller"` | DB `user.roleId` = `"role-caller"` |
| Session returns `roleId` instead of `role` | `session.user.roleId` exists, `role` undefined |
| tRPC context resolves role correctly | `ctx.role.id` matches `session.user.roleId` |
| `healthCheck` is public (no auth required) | Returns 200 without session |
| `privateData` with insufficient permission | Returns 403 FORBIDDEN |
| `leads.list` with `leads:read` permission | Returns 200 |
| `leads.create` without `leads:write` permission | Returns 403 |
| Seed script upserts roles without duplicates | Roles table has exactly 3 rows |
| Backfill maps `"caller"` → `"role-caller"` | Old users have correct roleId |
| Session invalidation forces re-login | After delete, `getSession()` returns null |

### Manual Testing Flow

1. Start with an existing database (some users with old `role` column)
2. Apply schema change (drop role, add $default on roleId)
3. Run seed script
4. Run migration
5. Invalidate sessions
6. Restart app
7. Try to access dashboard without logging in → should redirect to login
8. Log in → should work, session should have `roleId`
9. Check a protected route → allowed or denied based on role
10. Check UI → elements hidden/shown based on permissions

---

## Appendix C: Dependency Graph

```
Phase 1 (Schema)
  └─► Phase 2 (Auth Config)
       └─► Phase 3 (Context)
            └─► Phase 4 (Middleware)
                 └─► Phase 5 (Routers)
                      └─► Phase 6 (UI)
Phase 7 (Migration) ── independent of UI ──► can be done in parallel with Phase 6
Phase 8 (Session Invalidation) ── must be LAST
```

**Implementation order within each phase**: The file changes listed in each section are in the order you should implement them. Each file change lists its dependencies at the top of the section.

---

## Appendix D: tRPC v11 Integration Note

The project uses `@trpc/tanstack-react-query` v11 (the new proxy-based integration). The `createTRPCOptionsProxy` returns an object that generates React Query options:

```typescript
// This returns query options, not a promise:
trpc.auth.getMyPermissions.queryOptions();  // or just trpc.auth.getMyPermissions()

// To call directly from non-React code (like PermissionProvider):
// Use the raw client:
import { trpcClient } from "@/utils/trpc";
await trpcClient.auth.getMyPermissions.query();
```

Make sure `apps/web/src/utils/trpc.ts` exports the raw client:

```typescript
// apps/web/src/utils/trpc.ts — add this export
export const rawClient = trpcClient;
```

Or better, create a dedicated function in the providers file.

---

*End of design document.*
