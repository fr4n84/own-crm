# Agendas Feedback and Closer Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phone and read-only caller feedback to Agendas and provide a separate closer-feedback action that persists independent Q&A data.

**Architecture:** Reuse the existing lead data and role-aware drawers. Add caller feedback and phone columns, keep a read-only view action for caller data, add a distinct closer feedback field to `CloserQAForm`, and persist it through the existing closer Q&A mutation as `questionKey: "closerFeedback"`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, tRPC v11, TanStack React Form, Vitest, shadcn/ui DataTable/Card/Drawer components.

## Global Constraints

- Caller feedback is the existing `lead.feedback` field and is read-only.
- Closer feedback is a separate Q&A item with `questionKey: "closerFeedback"` and `authorRole: "closer"`.
- Agendas exposes separate caller-view and closer-feedback actions.
- Reuse the existing `LeadViewDrawer`, `AssignLeadDrawer`, `CloserQAForm`, and `recordCloserAnswers` mutation.
- Do not overwrite caller feedback when saving closer feedback.
- Preserve existing caller/closer Q&A behavior, agenda filtering, alert behavior, and role permissions.
- Keep table and action controls responsive on mobile.
- Keep changes on `features`; do not push, merge, or create a PR automatically.

---

### Task 1: Add independent closer feedback persistence

**Files:**
- Modify: `apps/web/src/features/leads/closer-qa-form.tsx:26-440`
- Modify: `apps/web/src/features/leads/closer-qa-form.test.tsx`
- Verify: `packages/api/src/leads/services/record-closer-answers.ts:60-82`

**Interfaces:**
- Consumes: Existing closer Q&A items and `recordCloserAnswers` input.
- Produces: Optional closer feedback field persisted as caller-independent Q&A.

- [ ] **Step 1: Add a failing closer feedback form test**

  Extend the existing closer form tests to render the form with a lead and assert:

  - A field labeled `Feedback del closer` exists.
  - Existing caller feedback is not rendered as an editable field.
  - Submitting a value adds `{ questionKey: "closerFeedback", answer: value }` to the closer payload.
  - Existing closer Q&A answers remain in the payload.

- [ ] **Step 2: Run the focused closer test and confirm it fails**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/leads/closer-qa-form.test.tsx
  ```

  Expected: FAIL because `CloserQAForm` has no feedback field or payload entry.

- [ ] **Step 3: Add optional `closerFeedback` to the form model**

  Add `closerFeedback` to the Zod schema/default values, parse it from existing closer-authored Q&A, and render a `Textarea` labeled `Feedback del closer`. Do not make it required and do not add caller feedback to this form.

- [ ] **Step 4: Include closer feedback in the existing payload**

  Update `buildPayload` so non-empty closer feedback is appended to the questions array:

  ```ts
  {
    questionKey: "closerFeedback",
    question: "Feedback del closer",
    answer: value.closerFeedback,
  }
  ```

  `recordCloserAnswers` already stamps every submitted question with the closer author role/ID and replaces only that closer's previous items, so no mutation contract change is needed.

- [ ] **Step 5: Run closer tests and typecheck**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/leads/closer-qa-form.test.tsx
  pnpm check-types
  ```

  Expected: closer feedback tests pass and existing closer behavior remains green.

### Task 2: Add phone, caller feedback, and independent actions to Agendas

**Files:**
- Modify: `apps/web/src/features/agendas/agenda-utils.ts:1-60`
- Modify: `apps/web/src/features/agendas/agenda-columns.tsx:1-30`
- Modify: `apps/web/src/app/agendas/page.tsx:1-55`
- Modify: `apps/web/src/features/leads/lead-view-drawer.tsx:18-80`

**Interfaces:**
- Consumes: Full lead rows, existing caller feedback field, Q&A questions, and role-aware drawers.
- Produces: Agenda rows with phone/feedback and separate view/closer-feedback actions.

- [ ] **Step 1: Add failing agenda table/action tests**

  Extend `apps/web/src/app/agendas/page.test.tsx` to assert:

  - Headers include `Teléfono` and `Feedback del caller`.
  - A row displays the lead phone and `lead.feedback`.
  - The row exposes separate view and closer-feedback action controls.
  - Caller feedback text is rendered as non-editable content in the view action.

- [ ] **Step 2: Run the agenda page tests and confirm the new assertions fail**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/app/agendas/page.test.tsx
  ```

  Expected: FAIL because the current columns do not include phone, feedback, or actions.

- [ ] **Step 3: Extend `AgendaLead` with existing lead fields**

  Preserve `phone`, `feedback`, `caller`, `closer`, and `questions` when `filterAgendaLeads` returns a row. Do not create a second feedback source or alter the agenda detection rule.

- [ ] **Step 4: Add dedicated columns and action rendering**

  Add columns:

  - `Teléfono`: `row.original.phone`.
  - `Feedback del caller`: `row.original.feedback ?? "Sin feedback"`.
  - `Acciones`: render two independent controls: `LeadViewDrawer` for read-only caller data and `AssignLeadDrawer` for the existing role-aware closer form.

  Pass the full lead shape required by both drawers. Keep caller feedback outside the closer form props so it cannot be edited there.

- [ ] **Step 5: Display caller feedback read-only in the view action**

  Extend `LeadViewDrawer` data with optional `feedback` and render a disabled/read-only `Feedback del caller` field in its view content. Do not add an input handler or mutation for this field.

- [ ] **Step 6: Run agenda tests and typecheck**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/app/agendas/page.test.tsx src/features/agendas
  pnpm check-types
  ```

  Expected: phone/feedback/action assertions pass and existing agenda filtering remains unchanged.

### Task 3: Verify closer action behavior from Agendas

**Files:**
- Modify: `apps/web/src/app/agendas/page.test.tsx`
- Verify: `apps/web/src/features/leads/assign-lead-drawer.tsx:162-223`
- Verify: `apps/web/src/features/leads/closer-qa-form.tsx`

**Interfaces:**
- Consumes: Agenda action row and existing role resolution.
- Produces: Verified closer can open and submit the independent feedback form without caller feedback mutation.

- [ ] **Step 1: Add the role/action regression test**

  Mock the role-aware drawer in the agenda page test and assert the edit action receives the full agenda lead, including caller feedback and questions, while the closer form receives only closer-editable Q&A through the existing drawer path.

- [ ] **Step 2: Run the focused regression tests**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/app/agendas/page.test.tsx src/features/leads/closer-qa-form.test.tsx
  ```

  Expected: view/action tests and closer feedback persistence tests pass.

- [ ] **Step 3: Perform the responsive manual check**

  Open `/agendas` as a closer and verify:

  - Phone and caller feedback are visible.
  - View opens caller feedback read-only.
  - Closer action opens the closer form with `Feedback del closer`.
  - Saving closer feedback does not change caller feedback.
  - Action controls remain usable on mobile.

### Task 4: Final verification

**Files:**
- Verify: `apps/web/src/app/agendas/page.tsx`
- Verify: `apps/web/src/features/agendas/agenda-columns.tsx`
- Verify: `apps/web/src/features/agendas/agenda-utils.ts`
- Verify: `apps/web/src/features/leads/lead-view-drawer.tsx`
- Verify: `apps/web/src/features/leads/closer-qa-form.tsx`
- Verify: `apps/web/src/features/leads/assign-lead-drawer.tsx`

**Interfaces:**
- Consumes: Completed columns, actions, read-only caller feedback, and closer feedback persistence.
- Produces: Verified independent feedback workflow with unchanged caller data.

- [ ] **Step 1: Run the complete typecheck and test suite**

  Run:

  ```bash
  pnpm check-types
  pnpm -r test
  ```

  Expected: all configured commands exit successfully.

- [ ] **Step 2: Check final scope**

  Run:

  ```bash
  git diff --check
  git status --short
  git diff -- apps/web/src/app/agendas apps/web/src/features/agendas apps/web/src/features/leads/lead-view-drawer.tsx apps/web/src/features/leads/closer-qa-form.tsx packages/api/src/leads/services/record-closer-answers.ts
  ```

  Confirm caller feedback remains read-only, closer feedback is stored under `closerFeedback`, and no caller/alert/lead behavior changed outside the requested workflow.

## Verification Summary

- Table: phone, caller feedback, and separate actions.
- View: caller feedback read-only.
- Edit: closer-only feedback field using existing Q&A mutation.
- Regression safety: caller feedback and existing Q&A data are not overwritten.
