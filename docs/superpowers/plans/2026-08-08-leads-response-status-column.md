# Leads Caller Response Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the Leads table `Respuesta` value from the latest caller `isContacted` answer.

**Architecture:** Keep the logic in the existing frontend column definitions and inspect the already-loaded `questions` array. Scan from the end for the latest caller-authored `isContacted` item; return `Si`, `No`, or `Sin asignar` without changing backend data or requests.

**Tech Stack:** React, TypeScript, TanStack Table, Vitest, Testing Library.

## Global Constraints

- Use the existing `questions` array from each loaded lead.
- Consider only items with `authorRole: "caller"` and `questionKey: "isContacted"`.
- Use the latest matching item when multiple caller answers exist.
- Display exactly `Si`, `No`, or `Sin asignar`.
- Do not use the persisted `response` field for this display value.
- Do not modify backend files or add requests.
- Preserve all existing filters, columns, date/time formatting, and actions.

---

### Task 1: Derive the caller response status

**Files:**
- Modify: `apps/web/src/features/table/columns.tsx`
- Modify: `apps/web/src/features/table/columns.test.tsx`

**Interfaces:**
- Consumes: lead rows with `questions` containing caller/closer Q&A items.
- Produces: the existing `Respuesta` column with derived `Si`, `No`, or `Sin asignar` text.

- [ ] **Step 1: Write failing tests**

  Extend `apps/web/src/features/table/columns.test.tsx` with rows covering:

  ```tsx
  { questionKey: "isContacted", answer: "Si", authorRole: "caller" }
  { questionKey: "isContacted", answer: "No", authorRole: "caller" }
  { questionKey: "isContacted", answer: "Si", authorRole: "closer" }
  ```

  Assert that caller `Si`/`No` render their matching values, closer-only data
  renders `Sin asignar`, and a row with no questions renders `Sin asignar`.
  Add a case with two caller `isContacted` items and assert the last one wins.

- [ ] **Step 2: Run focused tests and verify RED**

  ```powershell
  pnpm --filter web test -- src/features/table/columns.test.tsx
  ```

  Expected: the new `Respuesta` assertions fail because the column currently
  reads the raw `response` value.

- [ ] **Step 3: Implement the minimal derivation**

  Add a small helper in `columns.tsx` that scans the questions array from the
  last item to the first and returns the latest caller `isContacted` answer only
  when it is exactly `Si` or `No`; otherwise return `Sin asignar`. Use this
  helper in the existing `Respuesta` cell and leave its `accessorKey` unchanged.

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
- Consumes: Task 1's response-status derivation.
- Produces: verified frontend-only scope and passing project checks.

- [ ] **Step 1: Confirm no unrelated behavior changed**

  Confirm filters, user-name columns, date/time columns, row actions, and query
  calls remain unchanged.

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
