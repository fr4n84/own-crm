# Tasks: Leads Date Range Filter

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350–450 (hand-written ~210, shadcn generated ~220) |
| 400-line budget risk | Medium (over 400 only because of generated Calendar+Popover boilerplate) |
| Chained PRs recommended | No |
| Suggested split | Single PR (generated UI primitives are not independently reviewable) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

## Phase 1: Database Layer

### Task 1: Export `gte` from packages/db
**Files**: `packages/db/src/index.ts`
**Depends on**: —
**Est. changed lines**: 1

- [x] 1. Add `gte` to the drizzle-orm re-export on line 7 alongside existing `lte`.
- [x] 2. Verify: `turbo run check-types --filter=@crm-fran/db`.

## Phase 2: Service Layer (TDD)

### Task 2: RED — Write tests for `getAll` with dateRange
**Files**: `packages/api/src/leads/services/get-all.test.ts` (new)
**Depends on**: 1
**Est. changed lines**: 35

- [x] 1. Mock `selectLeadWithUsers` via `vi.mock("../queries/index")`.
- [x] 2. Test: `getAll()` with no args → calls `selectLeadWithUsers()` with no WHERE.
- [x] 3. Test: `getAll({ dateRange: { from: "2025-01-01" } })` → passes `gte(createdAt, startOfDay("2025-01-01"))`.
- [x] 4. Test: `getAll({ dateRange: { to: "2025-03-31" } })` → passes `lte(createdAt, endOfDay("2025-03-31"))`.
- [x] 5. Test: `getAll({ dateRange: { from, to } })` → passes `and(gte(...), lte(...))`.
- [x] 6. Verify: `turbo run test --filter=@crm-fran/api -- get-all.test` (expect FAIL).

### Task 3: GREEN — Implement `getAll` date filtering
**Files**: `packages/api/src/leads/services/get-all.ts`
**Depends on**: 2
**Est. changed lines**: 12

- [x] 1. Accept optional `{ dateRange?: { from?: string; to?: string } }` parameter.
- [x] 2. Build WHERE: `gte(leads.createdAt, startOfDay(from))` and/or `lte(leads.createdAt, endOfDay(to))`, combined with `and()`.
- [x] 3. Pass composed WHERE to `selectLeadWithUsers(where)`.
- [x] 4. Verify: `turbo run test --filter=@crm-fran/api -- get-all.test` (expect PASS).

### Task 4: RED — Write tests for `getByUserId` with dateRange
**Files**: `packages/api/src/leads/services/get-by-user.test.ts` (new)
**Depends on**: 3
**Est. changed lines**: 40

- [x] 1. Mock `selectLeadWithUsers`.
- [x] 2. Test: `getByUserId({ userId })` with no dateRange → existing `or(eq(callerId), eq(closerId))` WHERE (backward compat).
- [x] 3. Test: `getByUserId({ userId, dateRange: { from, to } })` → `and(or(...), gte(...), lte(...))`.
- [x] 4. Test: partial dateRange (from only) → `and(or(...), gte(...))`.
- [x] 5. Verify: `turbo run test --filter=@crm-fran/api -- get-by-user.test` (expect FAIL).

### Task 5: GREEN — Implement `getByUserId` date filtering
**Files**: `packages/api/src/leads/services/get-by-user.ts`
**Depends on**: 4
**Est. changed lines**: 12

- [x] 1. Accept optional `dateRange` in params alongside `userId`.
- [x] 2. Build date filter clauses with `gte`/`lte` + `startOfDay`/`endOfDay`.
- [x] 3. Combine user filter and date filter with `and()`.
- [x] 4. Verify: `turbo run test --filter=@crm-fran/api -- get-by-user.test` (expect PASS).

## Phase 3: tRPC Layer

### Task 6: Add dateRange input schema and wire to services
**Files**: `packages/api/src/routers/leads.ts`
**Depends on**: 5
**Est. changed lines**: 20

- [x] 1. Define `dateRangeInput = z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).optional()`.
- [x] 2. Add `.input(dateRangeInput)` to `listAll` and pass to `getAll(input)`.
- [x] 3. Add `.input(dateRangeInput)` to `listByUserId` and pass to `getByUserId({ userId: ctx.session.user.id, ...input })`.
- [x] 4. Verify: `turbo run check-types --filter=@crm-fran/api`.

## Phase 4: UI Components

### Task 7: Install shadcn Calendar + Popover
**Files**: `packages/ui/src/components/calendar.tsx`, `packages/ui/src/components/popover.tsx` (new, generated)
**Depends on**: —
**Est. changed lines**: ~220 (generated)

- [x] 1. Run `pnpm dlx shadcn@latest add calendar --cwd packages/ui`.
- [x] 2. Run `pnpm dlx shadcn@latest add popover --cwd packages/ui`.
- [x] 3. Verify: `turbo run check-types --filter=@crm-fran/ui`.

### Task 8: Create DateRangePicker component
**Files**: `apps/web/src/components/date-range-picker.tsx` (new)
**Depends on**: 7
**Est. changed lines**: 80

- [x] 1. Build component with two Popover+Calendar inputs (From / To).
- [x] 2. Accept `value: { from?: Date; to?: Date }` and `onChange` callback.
- [x] 3. Disable dates after `to` in "from" calendar and before `from` in "to" calendar.
- [x] 4. Add clear button that resets both to undefined.
- [x] 5. Verify: `turbo run check-types --filter=@crm-fran/web`.

### Task 9: Write component tests for DateRangePicker
**Files**: `apps/web/src/components/date-range-picker.test.tsx` (new)
**Depends on**: 8
**Est. changed lines**: 60

- [x] 1. Test: renders with placeholder text when value is empty.
- [x] 2. Test: calls onChange when both dates selected.
- [x] 3. Test: clear button calls onChange with `{ from: undefined, to: undefined }`.
- [x] 4. Verify: `turbo run test --filter=@crm-fran/web -- date-range-picker`.

## Phase 5: Page Integration

### Task 10: Wire DateRangePicker into leads page
**Files**: `apps/web/src/app/leads/page.tsx`
**Depends on**: 6, 9
**Est. changed lines**: 35

- [x] 1. Add `useState<{ from?: string; to?: string }>()` for date range.
- [x] 2. Convert state to `{ from?: string; to?: string }` (ISO format) for tRPC input.
- [x] 3. Pass `dateRange` directly to `listAll.queryOptions(dateRange)` and `listByUserId.queryOptions(dateRange)` (NOT wrapped in `{ dateRange }` — the router schema IS the direct input).
- [x] 4. Render `<DateRangePicker>` above `<DataTable>`.
- [x] 5. Verify: `turbo run check-types --filter=@crm-fran/web`.

## Phase 6: Verification

### Task 11: Run full test suite and typecheck
**Files**: —
**Depends on**: 10
**Est. changed lines**: 0

1. Run `turbo test --continue` — all packages pass.
2. Run `turbo run check-types` — no type errors.
3. Manual browser check: navigate to `/leads`, verify picker works end-to-end.
