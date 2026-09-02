# Leads Date Range Filter Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with focused verification. Do not start the SDD lifecycle.

**Goal:** Make the existing Leads date-range controls compact while preserving server-side filtering by `createdAt`.

**Architecture:** Keep the current `DateRangePicker` and tRPC data flow. Only adjust the picker presentation and its focused tests; no database, router, or query changes are needed.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, shadcn/ui, Vitest, Testing Library.

## Global Constraints

- Keep the existing `from?: string` / `to?: string` controlled interface.
- Preserve disabled-date rules and clear behavior.
- Do not modify unrelated Leads features or SDD artifacts.
- Use compact buttons; do not use a fixed `w-[200px]` width.

---

### Task 1: Make date-range controls compact

**Files:**
- Modify: `apps/web/src/components/date-range-picker.tsx:84-94,112-122`

**Interfaces:**
- Consumes: existing `from`, `to`, and `onChange` props.
- Produces: the same controlled picker with compact `From` and `To` buttons.

- [ ] **Step 1: Replace fixed button sizing**

  In both calendar trigger buttons, replace `w-[200px]` with compact classes such as:

  ```tsx
  "min-w-[120px] justify-start px-3 text-left font-normal"
  ```

  Keep `variant="outline"`, the muted empty state, calendar icon, and existing
  date formatting.

- [ ] **Step 2: Run the focused component test**

  Run from the repository root:

  ```powershell
  pnpm --filter web test -- src/components/date-range-picker.test.tsx
  ```

  Expected: all existing picker tests pass.

### Task 2: Add a compact-layout regression assertion

**Files:**
- Modify: `apps/web/src/components/date-range-picker.test.tsx:10-68`

**Interfaces:**
- Consumes: the existing rendered trigger buttons.
- Produces: a regression test proving the picker no longer uses the wide fixed class.

- [ ] **Step 1: Add a focused assertion**

  Extend the empty-state test with:

  ```tsx
  expect(
    Array.from(container.querySelectorAll("button")).filter((button) =>
      button.textContent?.includes("Pick a date"),
    ),
  ).toHaveLength(2);
  expect(container.querySelectorAll("button.w-\\[200px\\]")).toHaveLength(0);
  ```

- [ ] **Step 2: Run the focused test again**

  ```powershell
  pnpm --filter web test -- src/components/date-range-picker.test.tsx
  ```

  Expected: all picker tests pass, including the compact-layout assertion.

### Task 3: Verify the direct feature path

**Files:**
- Verify: `apps/web/src/app/leads/page.tsx`
- Verify: `packages/api/src/routers/leads.ts`

- [ ] **Step 1: Run the web typecheck**

  ```powershell
  pnpm check-types
  ```

  Expected: no new errors caused by the compact picker change. Report unrelated
  baseline errors separately.

- [ ] **Step 2: Confirm the behavior contract**

  Confirm that selecting dates still sends the controlled `{ from, to }` values
  through the existing tRPC query and that the API continues filtering by
  `leads.createdAt`.

## Completion Criteria

- The two date buttons are visually compact and no longer use `w-[200px]`.
- Existing date selection, disabled-date, clear, and server-side filtering behavior is unchanged.
- Focused picker tests pass.
- Typecheck introduces no new errors.
