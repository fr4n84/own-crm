# Leads Response Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent frontend response-status filter to the Leads view.

**Architecture:** Extract the existing caller response derivation into a shared pure helper. Reuse it in the `Respuesta` column and in a new response Select predicate; keep response, date, and closer states independent and combine only their active predicates.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing Base UI Select.

## Global Constraints

- Use the loaded lead `questions` array and the shared caller response-status helper.
- Display exactly `Todas las respuestas`, `Si`, `No`, and `Sin asignar` in the response filter.
- Keep the response filter inactive by default.
- Keep response, date, and closer filter state and predicates independent.
- Do not modify backend files or add requests.
- Preserve existing columns, date/closer filters, and row actions.

---

### Task 1: Share response status and add the response filter

**Files:**
- Create: `apps/web/src/features/leads/response-status.ts`
- Modify: `apps/web/src/features/table/columns.tsx`
- Modify: `apps/web/src/app/leads/page.tsx`
- Modify: `apps/web/src/features/table/columns.test.tsx`
- Modify: `apps/web/src/app/leads/page.test.tsx`

**Interfaces:**
- Consumes: loaded lead `questions` and existing filter state.
- Produces: shared `getCallerResponseStatus` plus a local response Select and predicate.

- [ ] **Step 1: Move response derivation into a shared pure helper**

  Create `getCallerResponseStatus(questions)` in
  `apps/web/src/features/leads/response-status.ts`. It must scan from the last
  question to the first, consider only caller `isContacted` items, and return
  exactly `Si`, `No`, or `Sin asignar`.

- [ ] **Step 2: Add failing tests for the response filter**

  Extend the existing Leads page test to capture a third Select callback and
  its labels. Assert the default options contain:

  ```tsx
  [
    { value: "all", label: "Todas las respuestas" },
    { value: "Si", label: "Si" },
    { value: "No", label: "No" },
    { value: "Sin asignar", label: "Sin asignar" },
  ]
  ```

  Add rows with caller `Si`, caller `No`, and no caller response. Assert the
  initial state contains all rows, selecting each response returns only the
  matching rows, and selecting `all` restores the rows allowed by the other
  active filters.

- [ ] **Step 3: Run focused tests and verify RED**

  ```powershell
  pnpm --filter web test -- src/app/leads/page.test.tsx src/features/table/columns.test.tsx
  ```

  Expected: the new response-filter assertions fail because the response Select
  and predicate do not exist yet.

- [ ] **Step 4: Implement the independent response filter**

  Add a response state with an `all` sentinel, render the response Select next
  to the existing filters, and use the shared helper in a separate
  `matchesResponse` predicate. Return a row only when its active date, closer,
  and response predicates all pass. Keep each state and event handler separate.

- [ ] **Step 5: Reuse the helper in the response column**

  Update `columns.tsx` to import the shared helper instead of keeping a second
  response derivation implementation.

- [ ] **Step 6: Run focused tests and verify GREEN**

  ```powershell
  pnpm --filter web test -- src/app/leads/page.test.tsx src/features/table/columns.test.tsx
  ```

  Expected: all focused response, columns, and existing filter tests pass.

### Task 2: Verify scope and type safety

**Files:**
- Verify: `apps/web/src/features/leads/response-status.ts`
- Verify: `apps/web/src/features/table/columns.tsx`
- Verify: `apps/web/src/app/leads/page.tsx`
- Verify: `apps/web/src/app/leads/page.test.tsx`
- Verify: `packages/api/src/leads/queries/leads-with-users.ts`

**Interfaces:**
- Consumes: Task 1's shared status helper and response filter.
- Produces: verified frontend-only scope and passing project checks.

- [ ] **Step 1: Confirm no backend or query changes**

  Confirm response status is derived from loaded rows and no new query inputs or
  backend files were introduced.

- [ ] **Step 2: Run typecheck and the full test suite**

  ```powershell
  pnpm check-types
  pnpm -r test
  ```

- [ ] **Step 3: Check the diff**

  ```powershell
  git diff --check
  ```

  Confirm existing date/closer filters, columns, and actions remain intact.
