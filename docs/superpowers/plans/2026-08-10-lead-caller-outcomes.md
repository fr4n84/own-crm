# Lead Caller Outcome Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the caller's existing `¿Fue contactado?` flow with optional previous Q&A fields and outcome-specific scheduling, creating a one-time alert only for `Llamar a futuro`.

**Architecture:** Keep the existing `assignLead` transaction as the single write boundary. Preserve the `isContacted` branch: `No` uses the current direct alert path, while `Sí` adds an explicit caller outcome and keeps the previous Q&A fields optional. Validate only outcome-specific scheduling fields, persist outcome/optional fields as caller Q&A items, and insert a one-time `no_contact` alert only for future calls.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, tRPC v11, Zod v4, Drizzle ORM, PostgreSQL, TanStack React Form, shadcn/ui Select/Input components, and Vitest.

## Global Constraints

- Keep `isContacted` as the first caller decision; `No` retains the existing direct alert path.
- For `isContacted: "Si"`, caller outcomes are `future_call`, `not_fit`, `not_interested`, and `appointment`.
- `future_call` requires exact date, exact time, and selectable severity `urgent`/`warning`/`info`; it creates one non-recurring `no_contact` alert.
- `appointment` requires closer, date, and time; it creates no alert.
- All previous caller Q&A fields remain visible after `Si` and are optional for every outcome.
- Hidden outcome-specific values must be cleared in the form and must not be submitted.
- Keep caller writes, lead updates, and optional alert creation in the existing transaction.
- Preserve closer Q&A, alert list filters, alert countdown, global visibility, and counter invalidation.
- Keep existing action permissions and do not add a new API endpoint.
- Do not commit, push, merge, or create a PR automatically; local commits are allowed only when explicitly chosen for delegated work.

---

### Task 1: Add tested caller outcome validation and payload rules

**Files:**
- Create: `packages/api/src/leads/services/caller-outcome.ts`
- Create: `packages/api/src/leads/services/caller-outcome.test.ts`
- Modify: `packages/api/src/leads/services/assign-lead.ts:14-31`
- Modify: `packages/api/src/routers/leads.ts:51-71`

**Interfaces:**
- Consumes: Caller outcome input and optional closer/date/time/severity fields.
- Produces: `CallerOutcome`, `AssignLeadInput`, and `validateCallerOutcomeInput` used by the router/service.

- [ ] **Step 1: Write failing validation tests**

  Add pure tests proving the four outcomes and conditional requirements:

  ```ts
  import { describe, expect, it } from "vitest";
  import { validateCallerOutcomeInput } from "./caller-outcome";

  describe("caller outcome validation", () => {
    it("accepts not_fit and not_interested without extra fields", () => {
      expect(validateCallerOutcomeInput({ outcome: "not_fit" })).toBeUndefined();
      expect(validateCallerOutcomeInput({ outcome: "not_interested" })).toBeUndefined();
    });

    it("requires date, time, and severity for future_call", () => {
      expect(validateCallerOutcomeInput({ outcome: "future_call" })).toMatchObject({
        scheduledDate: expect.any(String),
        scheduledTime: expect.any(String),
        alertSeverity: expect.any(String),
      });
    });

    it("requires closer, date, and time for appointment", () => {
      expect(validateCallerOutcomeInput({ outcome: "appointment" })).toMatchObject({
        closerId: expect.any(String),
        scheduledDate: expect.any(String),
        scheduledTime: expect.any(String),
      });
    });
  });
  ```

  Use explicit invalid-input assertions that identify each missing field; do not make the test pass by returning a generic boolean without field names.

- [ ] **Step 2: Run the focused validation test and confirm it fails**

  Run:

  ```bash
  pnpm --filter @crm-fran/api exec vitest run src/leads/services/caller-outcome.test.ts
  ```

  Expected: FAIL because the helper module and validation function do not exist.

- [ ] **Step 3: Implement the outcome type and validation helper**

  Define:

  ```ts
  export type CallerOutcome =
    | "future_call"
    | "not_fit"
    | "not_interested"
    | "appointment";

  export type CallerOutcomeInput = {
    outcome: CallerOutcome;
    closerId?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    alertSeverity?: "urgent" | "warning" | "info";
  };

  export function validateCallerOutcomeInput(
    input: CallerOutcomeInput,
  ): Record<string, string> | undefined;
  ```

  Return field-specific errors for missing `closerId`, `scheduledDate`, `scheduledTime`, or `alertSeverity` only when their outcome needs them. Reject invalid/past date-time combinations for `future_call` and `appointment`.

- [ ] **Step 4: Wire the router input to the new discriminated outcome contract**

  Preserve the legacy `isContacted: "No"` branch and add outcome branches under `isContacted: "Si"`. Use Zod literals for the four outcomes, keep the previous `questions` array available on `Si`, and use `z.enum(["urgent", "warning", "info"])` for future-call severity. Keep `leadId`, the existing `leads:write` procedure, and caller context unchanged.

- [ ] **Step 5: Run validation and router typecheck tests**

  Run:

  ```bash
  pnpm --filter @crm-fran/api exec vitest run src/leads/services/caller-outcome.test.ts
  pnpm check-types
  ```

  Expected: validation tests pass and the router compiles against the new input contract.

### Task 2: Persist outcomes and create only future-call alerts

**Files:**
- Modify: `packages/api/src/leads/services/assign-lead.ts:24-157`
- Modify: `packages/api/src/routers/leads.assignLead.test.ts:1-389`

**Interfaces:**
- Consumes: Validated `CallerOutcomeInput` and current caller ID.
- Produces: Transactional lead/Q&A update, optional closer/date/time persistence, and optional one-time alert result.

- [ ] **Step 1: Add failing integration tests for all four outcomes**

  Add tests that call `caller.leads.assignLead` and verify:

  - `future_call` stores the `callerOutcome`, scheduled date/time, and importance answer, creates exactly one alert with `kind: no_contact`, mapped severity, exact `nextShowAt`, and `maxOccurrences: 1`.
  - `appointment` stores outcome/closer/date/time and creates zero alerts.
  - `not_fit` and `not_interested` store the outcome plus any optional previous answers and create zero alerts without requiring those answers.
  - Existing caller Q&A entries from the same caller are replaced without deleting other authors' entries.

- [ ] **Step 2: Run the focused integration tests and confirm they fail**

  Run:

  ```bash
  pnpm --filter @crm-fran/api exec vitest run src/routers/leads.assignLead.test.ts
  ```

  Expected: FAIL because the router/service still expects `isContacted` and creates alerts from the old binary branches.

- [ ] **Step 3: Update transactional question persistence**

  In `assignLead`, keep the old `isContacted: "No"` branch and add outcome-aware question construction for `isContacted: "Si"`. Remove current caller-authored Q&A entries, preserve closer/other-caller entries, then add:

  ```ts
  {
    questionKey: "callerOutcome",
    question: "¿Qué ha sucedido?",
    answer: OUTCOME_LABELS[input.outcome],
    authorRole: LEAD_QA_ROLE.CALLER,
    authorId: callerId,
  }
  ```

  Add the submitted previous Q&A items for every `Si` outcome, plus scheduled date/time, closer, and importance items only for the relevant outcome. Update the lead with `callerId` and `closerId` only when appointment supplies a closer; preserve the existing closer otherwise.

- [ ] **Step 4: Add one-time future-call alert creation**

  For `future_call` only, construct the local scheduled timestamp from the validated date/time, calculate a positive `intervalMinutes` for the existing schema, and insert:

  ```ts
  {
    id: crypto.randomUUID(),
    leadId,
    targetUserId: callerId,
    kind: ALERT_KIND.NO_CONTACT,
    message: "Llamar a futuro",
    severity: input.alertSeverity,
    intervalMinutes,
    maxOccurrences: 1,
    nextShowAt: scheduledAt,
    occurrences: 0,
  }
  ```

  Do not insert an alert for appointment, not_fit, or not_interested. Keep all writes inside the existing `db.transaction` callback.

- [ ] **Step 5: Run the integration tests and verify all outcomes**

  Run the same Vitest command from Step 2. Expected: all outcome, alert-count, exact-schedule, one-time, and Q&A-preservation tests pass.

### Task 3: Replace the caller form with conditional outcome fields

**Files:**
- Modify: `apps/web/src/features/leads/assign-lead-form.tsx:26-594`

**Interfaces:**
- Consumes: The new `assignLead` tRPC input and the four caller outcomes.
- Produces: Outcome-driven UI where only Agenda or Llamar a futuro shows additional fields.

- [ ] **Step 1: Add outcome-driven form tests or update existing form tests first**

  Update `apps/web/src/app/leads/page.test.tsx` or the existing form test harness to cover:

  - Outcome selector renders all four options.
  - `not_fit` and `not_interested` render the previous Q&A fields but no closer/date/time/importance fields.
  - `future_call` renders date/time/importance and no closer.
  - `appointment` renders closer/date/time and no importance.

- [ ] **Step 2: Replace the binary form state and schema**

  Keep `isContacted` as the first field. When it is `Si`, render `outcome`, all previous Q&A fields, and conditional alert/appointment fields. Keep all previous Q&A fields optional and enforce only outcome-specific requirements through the validator.

- [ ] **Step 3: Clear hidden values when outcome changes**

  When changing `isContacted` or outcome, clear every conditional field first. Then render:

- `No`: no following fields; submit the existing direct alert payload.
- `Si` + any outcome: all previous Q&A fields.
- `future_call`: scheduled date, scheduled time, severity.
- `appointment`: closer, scheduled date, scheduled time.
- `not_fit`/`not_interested`: no additional outcome-specific controls.

- [ ] **Step 4: Build the new mutation payload**

  Submit `isContacted` first. For `No`, send the legacy direct alert payload. For `Si`, send the selected outcome, non-empty previous Q&A answers, and only fields relevant to that outcome. Keep the existing success invalidation and toast behavior.

- [ ] **Step 5: Run frontend tests and typecheck**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/app/leads/page.test.tsx
  pnpm check-types
  ```

  Expected: conditional rendering and payload tests pass; closer Q&A and alert frontend tests remain green.

### Task 4: Final verification

**Files:**
- Verify: `apps/web/src/features/leads/assign-lead-form.tsx`
- Verify: `packages/api/src/routers/leads.ts`
- Verify: `packages/api/src/leads/services/assign-lead.ts`
- Verify: `packages/api/src/leads/services/caller-outcome.ts`
- Verify: `packages/api/src/routers/leads.assignLead.test.ts`

**Interfaces:**
- Consumes: Completed outcome form, validation, transactional persistence, and alert behavior.
- Produces: Verified outcome-specific caller workflow with no unintended changes to closer Q&A or alert frontend behavior.

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
  git diff -- apps/web/src/features/leads/assign-lead-form.tsx packages/api/src/routers/leads.ts packages/api/src/leads/services/assign-lead.ts packages/api/src/leads/services/caller-outcome.ts packages/api/src/routers/leads.assignLead.test.ts
  ```

  Confirm Agenda creates no alert, future_call creates one non-recurring alert, non-Agenda outcomes have no hidden required fields, and no closer Q&A or alert-list behavior changed.

## Verification Summary

- UI: four outcomes with conditional fields and no hidden values submitted.
- API: discriminated validation and transaction-safe persistence.
- Alerts: exact future-call schedule, severity mapping, one-time recurrence.
- Regression safety: existing closer Q&A and alert frontend behavior preserved.
