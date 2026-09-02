# Leads Date Range Filter — Specification

## Purpose

Add a custom date range filter (from/to) to the leads page. Users select a start and end date to filter leads by `createdAt`. Filtering is server-side via optional tRPC input. No database migrations required.

---

## Requirements

### REQ-1: Date Range Picker UI

A date range picker MUST be rendered above the DataTable on `/leads`. The picker consists of two date inputs (From and To). Each input MAY open a calendar popover (shadcn Calendar + Popover).

| Aspect | Behavior |
|--------|----------|
| Default state | Both inputs empty; placeholder text "Pick a date" |
| Selection | User picks a date for From, then a date for To |
| Clearing | A clear/dismiss action resets both inputs to empty |
| Position | Above DataTable, inside the page flex container |

#### Scenario: Initial load
- GIVEN the user navigates to `/leads`
- WHEN the page renders
- THEN the date range picker is visible above the DataTable
- AND both From and To inputs display placeholder text

#### Scenario: Select both dates
- GIVEN the date range picker is visible
- WHEN the user selects From = `2026-01-01` and To = `2026-01-31`
- THEN the inputs display the selected dates
- AND a query is triggered with `{ dateRange: { from: "2026-01-01", to: "2026-01-31" } }`

#### Scenario: Clear the filter
- GIVEN a date range is active
- WHEN the user clears the date picker
- THEN both inputs return to placeholder state
- AND a query is triggered with no `dateRange` parameter

---

### REQ-2: Server-side Date Filtering

The tRPC procedures `listAll` and `listByUserId` MUST accept an optional `dateRange` input. When provided, the service layer MUST apply `gte(createdAt, from)` and/or `lte(createdAt, to)` to the WHERE clause using `and()` to combine with existing filters.

**Zod input schema:**
```typescript
const dateRangeInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
}).optional();
```

| Input combination | WHERE clause |
|-------------------|--------------|
| `{ from, to }` | `and(existingFilter, gte(createdAt, from), lte(createdAt, to))` |
| `{ from }` only | `and(existingFilter, gte(createdAt, from))` |
| `{ to }` only | `and(existingFilter, lte(createdAt, to))` |
| `undefined` | `existingFilter` (no date conditions) |
| `{}` (empty object) | `existingFilter` (no date conditions) |

#### Scenario: Full range filter (admin)
- GIVEN an admin user with `leads:read` permission
- WHEN they call `listAll` with `{ dateRange: { from: "2026-01-01", to: "2026-01-31" } }`
- THEN the query returns only leads where `createdAt >= 2026-01-01 AND createdAt <= 2026-01-31`

#### Scenario: Partial range — from only
- GIVEN a user calls `listByUserId` with `{ dateRange: { from: "2026-03-01" } }`
- THEN the query returns leads for that user where `createdAt >= 2026-03-01`

#### Scenario: No filter
- GIVEN any user calls `listAll` or `listByUserId` without `dateRange`
- THEN all leads (scoped by role) are returned as before

---

### REQ-3: Filter State Management

The leads page component MUST manage the date range filter state locally via React state. Changing the date range MUST trigger a re-fetch of leads data through tRPC query options.

| Aspect | Behavior |
|--------|----------|
| State location | `useState` in `LeadsPage` component |
| Query key | Includes current `dateRange` value so React Query caches per-range |
| Re-fetch trigger | Date change updates state → query options change → refetch |
| Default | `undefined` (no filter) |

#### Scenario: State drives re-fetch
- GIVEN the user has `dateRange = undefined` and sees all leads
- WHEN they select From = `2026-07-01`, To = `2026-07-31`
- THEN state updates to `{ from: "2026-07-01", to: "2026-07-31" }`
- AND the tRPC query re-fetches with the new dateRange
- AND the DataTable updates to show only matching leads

#### Scenario: Admin vs non-admin both receive dateRange
- GIVEN an admin selects a date range
- THEN `listAll` receives `dateRange` and filters accordingly
- GIVEN a non-admin selects a date range
- THEN `listByUserId` receives BOTH the implicit `userId` AND the `dateRange`

---

### REQ-4: Date Validation

The date range picker SHOULD prevent invalid selections. If a `from` date is after `to` (or vice versa), the system MUST handle it gracefully.

#### Scenario: From after To
- GIVEN the user sets From = `2026-06-01` and To = `2026-01-01`
- THEN the UI MUST either prevent the selection (disable invalid dates in calendar) OR display a validation error
- AND no invalid query is sent to the server

#### Scenario: Server receives invalid range
- GIVEN a malformed request reaches the server with `from > to`
- THEN the server SHOULD return an empty result set (no leads match `createdAt >= from AND createdAt <= to` when from > to)
- AND no error is thrown

---

### REQ-5: Database Operator Export

`packages/db` MUST export the `gte` operator from `drizzle-orm` alongside the existing `lte` export. This is required for the service layer to build `createdAt >= from` conditions.

#### Scenario: gte is available
- GIVEN any package imports from `@crm-fran/db`
- WHEN it imports `gte`
- THEN the import resolves successfully

---

## Data Contract

**tRPC input (listAll / listByUserId after change):**
```typescript
{
  dateRange?: {
    from?: string;  // ISO date "YYYY-MM-DD"
    to?: string;    // ISO date "YYYY-MM-DD"
  }
}
```

**Response shape:** Unchanged — same `leadWithUsersSelect` projection with caller/closer joins.

---

## Affected Files

| File | Change |
|------|--------|
| `packages/db/src/index.ts` | Add `gte` to re-exports |
| `packages/api/src/routers/leads.ts` | Add `dateRangeInput` schema; wire `.input()` to `listAll` and `listByUserId` |
| `packages/api/src/leads/services/get-all.ts` | Accept optional `dateRange`; build WHERE with `and(gte, lte)` |
| `packages/api/src/leads/services/get-by-user.ts` | Accept optional `dateRange`; combine with existing `or(eq caller, eq closer)` |
| `apps/web/src/app/leads/page.tsx` | Add date range picker UI; manage state; pass to query options |
| `packages/ui/src/components/` | Add shadcn Calendar + Popover (if not already present) |

---

## Out of Scope

- URL persistence of filter state
- Preset date ranges (7/14/30 days)
- Filter by day of week
- Filter state persistence across navigation
