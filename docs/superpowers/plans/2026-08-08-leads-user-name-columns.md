# Leads User Name Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Do not start the SDD lifecycle. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display caller and closer names in the Leads table and closer filter instead of long raw IDs.

**Architecture:** Reuse the nested `caller` and `closer` relations already returned by the existing lead query. Keep display labels in the frontend while retaining raw closer IDs as Select values for the existing predicate; do not add requests, backend fields, or filtering changes.

**Tech Stack:** React, TypeScript, TanStack Table, Vitest, Testing Library.

## Global Constraints

- Use existing nested `caller` and `closer` objects from each loaded lead.
- Render `Sin asignar` when either relation or its name is unavailable.
- Do not render raw `callerId` or `closerId` values in the visible table cells.
- Display closer names in the closer Select while retaining raw `closerId` values internally.
- Do not modify backend files or add a user lookup request.
- Preserve existing filters, row actions, and table behavior.

---

### Task 1: Render user names in Lead columns

**Files:**
- Modify: `apps/web/src/features/table/columns.tsx`
- Modify: `apps/web/src/app/leads/page.tsx`
- Create: `apps/web/src/features/table/columns.test.tsx`
- Modify: `apps/web/src/app/leads/page.test.tsx`

**Interfaces:**
- Consumes: lead rows containing optional nested `caller` and `closer` relations.
- Produces: visible `Caller` and `Closer` cells plus closer Select labels with names or `Sin asignar`.

- [ ] **Step 1: Define the focused column test harness**

  No dedicated column test exists currently. Create
  `apps/web/src/features/table/columns.test.tsx` and test the column
  definitions directly: call `createLeadColumns(() => null)`, locate columns
  by their `header`, and invoke each cell renderer with a minimal row object.
  Keep the harness local to this test file; do not render the complete Leads
  page or add a new data-fetching mock.

- [ ] **Step 2: Write the failing tests**

  Add cases proving that a row with
  `{ caller: { id: "caller-1", name: "Ana Caller" }, closer: { id: "closer-1", name: "Bruno Closer" } }`
  renders `Ana Caller` and `Bruno Closer`, and a row with null relations renders
  `Sin asignar` for both columns. Assert the headers are `Caller` and `Closer`,
  not the raw ID labels.

- [ ] **Step 3: Run the focused tests and verify RED**

  ```powershell
  pnpm --filter web test -- src/features/table/columns.test.tsx
  ```

  Expected: the new name/fallback assertions fail because the columns currently
  render raw ID values.

- [ ] **Step 4: Implement the minimal column change**

  Change only the two column definitions to read the nested relation names and
  fall back to `Sin asignar`. Keep all other columns, sorting/accessor behavior,
  and row actions unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

  ```powershell
  pnpm --filter web test -- src/features/table/columns.test.tsx src/app/leads/page.test.tsx
  ```

  Expected: all focused tests pass.

- [ ] **Step 6: Update closer-filter labels without changing filter values**

  In `apps/web/src/app/leads/page.tsx`, derive unique closer options from the
  loaded rows as `{ id: lead.closerId, name: lead.closer?.name ?? "Sin asignar" }`.
  Keep `id` as the SelectItem `value` and render `name` as its visible label.
  Exclude null IDs, preserve the existing `all` sentinel, and keep the current
  predicate comparison against the selected ID.

- [ ] **Step 7: Test closer names in the filter**

  Extend `apps/web/src/app/leads/page.test.tsx` so the mocked Select captures
  closer option values and labels. Assert an assigned closer renders its name,
  a missing relation renders `Sin asignar`, and selecting the raw ID still
  filters the matching rows.

- [ ] **Step 8: Run the combined focused tests**

  ```powershell
  pnpm --filter web test -- src/features/table/columns.test.tsx src/app/leads/page.test.tsx
  ```

  Expected: all column and Leads filter tests pass.

### Task 2: Verify scope and type safety

**Files:**
- Verify: `apps/web/src/features/table/columns.tsx`
- Verify: `apps/web/src/features/table/columns.test.tsx`
- Verify: `packages/api/src/leads/queries/leads-with-users.ts`

**Interfaces:**
- Consumes: Task 1's name-rendering columns.
- Produces: verified frontend-only scope and passing project checks.

- [ ] **Step 1: Confirm existing relation data is sufficient**

  Verify `leads-with-users.ts` already projects `caller.name` and `closer.name`.

- [ ] **Step 2: Run typecheck and the full test suite**

  ```powershell
  pnpm check-types
  pnpm -r test
  ```

- [ ] **Step 3: Check the diff**

  ```powershell
  git diff --check
  ```

  Confirm no backend files or extra data-fetching changes were introduced.
