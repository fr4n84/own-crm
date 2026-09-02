# Agendas Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/agendas` tab available to every role with `leads:read`, showing only leads whose caller outcome is `Agenda` in a dedicated responsive table.

**Architecture:** Reuse the existing global `trpc.leads.listAll` query and extract agenda rows locally from caller-authored Q&A. Keep extraction and latest-answer rules in a pure tested helper, define dedicated agenda table columns, and register the route in the shared sidebar.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, tRPC v11, Vitest, shadcn/ui `DataTable`, and lucide icons.

## Global Constraints

- Route: `/agendas`.
- Access: existing `leads:read` permission boundary; no role-specific filtering.
- Data source: existing global `leads.listAll` query; no new API endpoint.
- Detection: caller-authored Q&A `questionKey: "callerOutcome"` with answer `Agenda`.
- Metadata: caller/closer relations plus caller Q&A `scheduledDate` and `scheduledTime`.
- Use the existing `DataTable` pattern and allow horizontal scrolling inside the table on mobile.
- Do not change lead assignment, alerts, closer Q&A, or the existing Leads page.
- Keep changes on `features`; do not push, merge, or create a PR automatically.

---

### Task 1: Add tested agenda extraction helpers

**Files:**
- Create: `apps/web/src/features/agendas/agenda-utils.ts`
- Create: `apps/web/src/features/agendas/agenda-utils.test.ts`

**Interfaces:**
- Consumes: Lead-like records with `caller`, `closer`, and Q&A items.
- Produces: `filterAgendaLeads`, `getLatestCallerQuestionAnswer`, and `AgendaLead`.

- [ ] **Step 1: Write failing helper tests**

  Add tests proving that only caller-authored Agenda outcomes are included, other outcomes are excluded, and the latest caller outcome wins:

  ```ts
  import { describe, expect, it } from "vitest";
  import { filterAgendaLeads } from "./agenda-utils";

  const lead = (questions: unknown[]) => ({
    id: "lead-1",
    name: "Lead 1",
    caller: { id: "caller-1", name: "Caller 1" },
    closer: { id: "closer-1", name: "Closer 1" },
    questions,
  });

  it("returns agenda leads with caller, closer, date, and time", () => {
    expect(
      filterAgendaLeads([
        lead([
          { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
          { questionKey: "scheduledDate", answer: "2099-01-01", authorRole: "caller" },
          { questionKey: "scheduledTime", answer: "10:00", authorRole: "caller" },
        ]),
      ]),
    ).toMatchObject([
      { id: "lead-1", scheduledDate: "2099-01-01", scheduledTime: "10:00" },
    ]);
  });

  it("excludes non-agenda outcomes and respects the latest caller outcome", () => {
    expect(
      filterAgendaLeads([
        lead([{ questionKey: "callerOutcome", answer: "No encaja", authorRole: "caller" }]),
        lead([
          { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
          { questionKey: "callerOutcome", answer: "No interesado", authorRole: "caller" },
        ]),
      ]),
    ).toEqual([]);
  });
  ```

- [ ] **Step 2: Run the helper test and confirm it fails**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/agendas/agenda-utils.test.ts
  ```

  Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement latest-answer extraction and agenda filtering**

  Define a typed `AgendaLead` that extends the lead row with `scheduledDate` and `scheduledTime`. Scan caller-authored questions from the end to find the latest `callerOutcome`, `scheduledDate`, and `scheduledTime`; include the lead only when the latest outcome is `Agenda`. Preserve missing metadata as `"Sin asignar"` values rather than throwing.

- [ ] **Step 4: Run helper tests and verify they pass**

  Run the same Vitest command from Step 2. Expected: all agenda extraction tests pass.

### Task 2: Create the Agendas page and dedicated columns

**Files:**
- Create: `apps/web/src/app/agendas/page.tsx`
- Create: `apps/web/src/features/agendas/agenda-columns.tsx`
- Create: `apps/web/src/app/agendas/page.test.tsx`

**Interfaces:**
- Consumes: `filterAgendaLeads`, `trpc.leads.listAll`, and `AgendaLead`.
- Produces: `/agendas` page with loading/error/empty states and a responsive agenda table.

- [ ] **Step 1: Add a failing page/table test**

  Test that the page uses `listAll`, renders only agenda rows, and shows the expected headers:

  Use the existing Vitest/Testing Library patterns from `apps/web/src/app/leads/page.test.tsx`: mock `trpc.leads.listAll.queryOptions()` with one lead whose caller outcome is `Agenda` and one with `No encaja`, render `<AgendasPage />`, assert the `Lead`, `Caller`, `Closer`, `Fecha`, and `Hora` headers, assert only the agenda lead appears, then render with no matching lead and assert the empty-state text.

- [ ] **Step 2: Run the page test and confirm it fails**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/app/agendas/page.test.tsx
  ```

  Expected: FAIL because the route, page, and columns do not exist.

- [ ] **Step 3: Implement agenda-specific column definitions**

  Create `agenda-columns.tsx` with `ColumnDef<AgendaLead>[]` for:

  - `Lead`: `row.original.name`.
  - `Caller`: `row.original.caller?.name ?? "Sin asignar"`.
  - `Closer`: `row.original.closer?.name ?? "Sin asignar"`.
  - `Fecha`: `row.original.scheduledDate`.
  - `Hora`: `row.original.scheduledTime`.

- [ ] **Step 4: Implement `/agendas` with global data and local filtering**

  Use:

  ```tsx
  <Can permission="leads:read" fallback={<p>No tenés permisos</p>}>
    <AgendasPageContent />
  </Can>
  ```

  Load `trpc.leads.listAll.queryOptions()` for every permitted role, keep loading/error states, filter with `filterAgendaLeads(data ?? [])`, and render:

  ```tsx
  <div className="min-w-0 overflow-x-auto">
    <DataTable
      data={agendaLeads}
      columns={agendaColumns}
      getRowId={(row) => row.id}
    />
  </div>
  ```

  Show an `Empty` state when `agendaLeads.length === 0`.

- [ ] **Step 5: Run page tests and typecheck**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/app/agendas/page.test.tsx src/features/agendas
  pnpm check-types
  ```

  Expected: agenda page and helper tests pass.

### Task 3: Register Agendas in shared navigation

**Files:**
- Modify: `packages/ui/src/components/app-sidebar.tsx:17-57`

**Interfaces:**
- Consumes: Existing static `navMain` entries and lucide icon imports.
- Produces: `Agendas` navigation item linking to `/agendas` for all roles using the shared sidebar.

- [ ] **Step 1: Add the navigation entry**

  Import a calendar icon from the existing lucide dependency and add:

  ```tsx
  {
    title: "Agendas",
    url: "/agendas",
    icon: <CalendarDaysIcon />,
  },
  ```

  Keep the existing Leads and Alert entries unchanged.

- [ ] **Step 2: Run navigation and typecheck verification**

  Run:

  ```bash
  pnpm check-types
  git diff --check
  ```

  Confirm the route string is exactly `/agendas` and no existing navigation item changed behavior.

### Task 4: Final verification

**Files:**
- Verify: `apps/web/src/app/agendas/page.tsx`
- Verify: `apps/web/src/features/agendas/agenda-utils.ts`
- Verify: `apps/web/src/features/agendas/agenda-columns.tsx`
- Verify: `packages/ui/src/components/app-sidebar.tsx`
- Verify: `apps/web/src/app/agendas/page.test.tsx`

**Interfaces:**
- Consumes: Completed agenda helper, page, table, navigation, and tests.
- Produces: Verified role-readable `/agendas` tab without changes to existing Leads/Alerts behavior.

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
  git diff -- apps/web/src/app/agendas/page.tsx apps/web/src/features/agendas/agenda-utils.ts apps/web/src/features/agendas/agenda-columns.tsx packages/ui/src/components/app-sidebar.tsx
  ```

  Confirm no lead mutation, alert behavior, closer Q&A, or existing Leads page files changed.

## Verification Summary

- Data: global listAll query with local caller-outcome extraction.
- UI: new `/agendas` route, dedicated DataTable, empty/loading/error states.
- Navigation: shared Agendas link for all permitted roles.
- Responsive: table overflow constrained to its own container on mobile.
