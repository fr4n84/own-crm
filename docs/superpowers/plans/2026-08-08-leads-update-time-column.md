# Leads Update Time Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate Leads table column showing the local hour and minute of the last update.

**Architecture:** Reuse `updatedAt` in the existing frontend column definitions. Preserve the date column and all current filtering, user-name rendering, and row actions; do not add backend work or another request.

**Tech Stack:** React, TypeScript, TanStack Table, Vitest, Testing Library.

## Global Constraints

- Use the existing `updatedAt` field from each loaded lead.
- Keep `Actualizado en` as the date column.
- Add `Hora de actualización` as a separate hour/minute column.
- Format the time in the browser's local timezone with two-digit hour and minute values.
- Do not modify backend files or add data-fetching requests.
- Preserve existing filters, user-name columns, and row actions.

---

### Task 1: Add the update-time column

**Files:**
- Modify: `apps/web/src/features/table/columns.tsx`
- Modify: `apps/web/src/features/table/columns.test.tsx`

**Interfaces:**
- Consumes: lead rows with `updatedAt`.
- Produces: a visible `Hora de actualización` column beside the existing update-date column.

- [ ] **Step 1: Write the failing column test**

  Extend `apps/web/src/features/table/columns.test.tsx` with a lead row whose
  `updatedAt` is a fixed `Date`. Locate the `Hora de actualización` column,
  invoke its cell renderer, and assert that it equals the local hour/minute
  produced by:

  ```tsx
  new Date(updatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
  ```

  Also assert that the existing `Actualizado en` header remains present.

- [ ] **Step 2: Run the focused test and verify RED**

  ```powershell
  pnpm --filter web test -- src/features/table/columns.test.tsx
  ```

  Expected: the new column lookup/assertion fails because the column does not exist yet.

- [ ] **Step 3: Implement the minimal column**

  Add a column after `Actualizado en` with:

  ```tsx
  {
    accessorKey: "updatedAt",
    header: "Hora de actualización",
    cell: ({ row }) =>
      new Date(row.original.updatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
  }
  ```

  Leave the existing date column and every other column unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

  ```powershell
  pnpm --filter web test -- src/features/table/columns.test.tsx src/app/leads/page.test.tsx
  ```

  Expected: all focused tests pass.

### Task 2: Verify scope and type safety

**Files:**
- Verify: `apps/web/src/features/table/columns.tsx`
- Verify: `apps/web/src/features/table/columns.test.tsx`

**Interfaces:**
- Consumes: Task 1's update-time column.
- Produces: verified frontend-only scope and passing project checks.

- [ ] **Step 1: Confirm no unrelated behavior changed**

  Confirm filters, user-name columns, row actions, and the existing date column
  remain unchanged.

- [ ] **Step 2: Run typecheck and the full test suite**

  ```powershell
  pnpm check-types
  pnpm -r test
  ```

- [ ] **Step 3: Check the diff**

  ```powershell
  git diff --check
  ```

  Confirm no backend files or new data-fetching code were introduced.
