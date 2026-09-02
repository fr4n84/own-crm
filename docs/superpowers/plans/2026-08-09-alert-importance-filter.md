# Alert Importance Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive alert-importance filter with `Todas`, `Alta`, `Media`, and `Baja`, remove `high` from the current severity domain, and display severity colors as red, yellow, and green.

**Architecture:** Keep the existing alerts query and local list rendering. Normalize the three supported severities plus legacy `high` in a small pure feature helper, use that helper for filtering and presentation, and render a controlled shadcn `ToggleGroup` in the alerts page. Update the alert domain default and affected expectations without changing dismiss or resolve behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, tRPC v11, Drizzle ORM, Vitest, Tailwind CSS v4, and shared shadcn/ui `ToggleGroup`, `ToggleGroupItem`, and `Badge` components.

## Global Constraints

- Keep the existing `features` branch and do not commit, merge, push, or create a PR automatically.
- User-facing filter labels are `Todas`, `Alta`, `Media`, and `Baja`.
- Current severity mapping is `urgent` → Alta/red, `warning` → Media/yellow, and `info` → Baja/green.
- Remove `HIGH: "high"` from `ALERT_SEVERITY`; legacy runtime values of `high` must still normalize to Alta.
- Keep `Todas` selected by default and filter the currently loaded alert collection locally.
- Preserve the existing alert callbacks, data fetching contract, dismiss behavior, and resolve behavior.
- All roles that pass `alerts:read` may list and count only pending alerts for every user; dismissed/resolved history remains in Leads and dismiss/resolve authorization remains unchanged.
- Use semantic color tokens; add `warning` and `success` tokens to the shared UI theme because the current theme has no yellow/green equivalents.
- Do not introduce manual `useMemo` or `useCallback`.
- Preserve the existing alert action placement already present in `apps/web/src/features/alerts/alert-card.tsx`.

---

### Task 1: Remove the obsolete `high` domain severity

**Files:**
- Modify: `packages/db/src/schema/alerts.ts:12-18`
- Modify: `packages/api/src/alerts/services/config.ts:3-16`
- Modify: `packages/db/src/schema/alerts.test.ts:9-16`
- Modify: `packages/api/src/routers/alerts.test.ts:111-134`
- Modify: `packages/api/src/routers/leads.assignLead.test.ts:138-147`

**Interfaces:**
- Consumes: `ALERT_SEVERITY`, `AlertSeverity`, and `ALERT_KIND_CONFIG`.
- Produces: `ALERT_SEVERITY` with only `INFO`, `WARNING`, and `URGENT`; `no_contact` defaults to `URGENT`.

- [ ] **Step 1: Add the failing domain assertion**

  In `packages/db/src/schema/alerts.test.ts`, assert the complete current domain instead of expecting `ALERT_SEVERITY.HIGH`:

  ```ts
  expect(Object.values(ALERT_SEVERITY)).toEqual([
    "info",
    "warning",
    "urgent",
  ]);
  ```

  Update the API and lead-assignment expectations from `ALERT_SEVERITY.HIGH`/`"high"` to `ALERT_SEVERITY.URGENT`/`"urgent"` so the tests describe the approved domain.

- [ ] **Step 2: Run the targeted tests and confirm the domain test fails**

  Run:

  ```bash
  pnpm --filter @crm-fran/db exec vitest run src/schema/alerts.test.ts
  ```

  Expected: FAIL because the current schema still exposes `HIGH` and the list of values still contains `"high"`.

- [ ] **Step 3: Remove `HIGH` and update the default configuration**

  Delete `HIGH: "high"` from `ALERT_SEVERITY` in `packages/db/src/schema/alerts.ts`. Change `ALERT_KIND_CONFIG[ALERT_KIND.NO_CONTACT].severity` from `ALERT_SEVERITY.HIGH` to `ALERT_SEVERITY.URGENT`.

- [ ] **Step 4: Run the targeted domain and API tests**

  Run:

  ```bash
  pnpm --filter @crm-fran/db exec vitest run src/schema/alerts.test.ts
  pnpm --filter @crm-fran/api exec vitest run src/routers/alerts.test.ts src/routers/leads.assignLead.test.ts
  ```

  Expected: all targeted tests pass with no `HIGH` reference remaining in production code or affected expectations.

### Task 2: Add tested severity normalization and local filtering

**Files:**
- Create: `apps/web/src/features/alerts/alert-importance.ts`
- Create: `apps/web/src/features/alerts/alert-importance.test.ts`

**Interfaces:**
- Consumes: Objects with a `severity: string` property, including legacy `high` values.
- Produces: `AlertSeverityFilter`, `normalizeAlertSeverity`, and `filterAlertsBySeverity` for page and card presentation.

- [ ] **Step 1: Write failing pure-function tests**

  Create tests covering the approved mapping and filtering behavior:

  ```ts
  import { describe, expect, it } from "vitest";

  import {
    filterAlertsBySeverity,
    normalizeAlertSeverity,
  } from "./alert-importance";

  const alerts = [
    { id: "urgent", severity: "urgent" },
    { id: "legacy-high", severity: "high" },
    { id: "warning", severity: "warning" },
    { id: "info", severity: "info" },
  ];

  describe("normalizeAlertSeverity", () => {
    it("maps urgent and legacy high to urgent", () => {
      expect(normalizeAlertSeverity("urgent")).toBe("urgent");
      expect(normalizeAlertSeverity("high")).toBe("urgent");
    });

    it("preserves warning and info", () => {
      expect(normalizeAlertSeverity("warning")).toBe("warning");
      expect(normalizeAlertSeverity("info")).toBe("info");
    });
  });

  it("filters all loaded alerts by the selected severity", () => {
    expect(filterAlertsBySeverity(alerts, "all")).toEqual(alerts);
    expect(filterAlertsBySeverity(alerts, "urgent").map((alert) => alert.id)).toEqual([
      "urgent",
      "legacy-high",
    ]);
    expect(filterAlertsBySeverity(alerts, "warning").map((alert) => alert.id)).toEqual([
      "warning",
    ]);
    expect(filterAlertsBySeverity(alerts, "info").map((alert) => alert.id)).toEqual([
      "info",
    ]);
  });
  ```

- [ ] **Step 2: Run the new test and confirm it fails because the helper is missing**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts/alert-importance.test.ts
  ```

  Expected: FAIL with the module or exported-function-not-found error.

- [ ] **Step 3: Implement the minimal normalization helper**

  Create the following API:

  ```ts
  export type AlertSeverityFilter = "all" | "urgent" | "warning" | "info";
  export type NormalizedAlertSeverity = Exclude<AlertSeverityFilter, "all">;

  export function normalizeAlertSeverity(
    severity: string,
  ): NormalizedAlertSeverity | null {
    if (severity === "urgent" || severity === "high") return "urgent";
    if (severity === "warning") return "warning";
    if (severity === "info") return "info";
    return null;
  }

  export function filterAlertsBySeverity<T extends { severity: string }>(
    alerts: readonly T[],
    filter: AlertSeverityFilter,
  ): T[] {
    if (filter === "all") return [...alerts];
    return alerts.filter(
      (alert) => normalizeAlertSeverity(alert.severity) === filter,
    );
  }
  ```

- [ ] **Step 4: Run the helper test and verify it passes**

  Run the same Vitest command from Step 2. Expected: all helper tests pass.

### Task 3: Render the filter and three-color severity presentation

**Files:**
- Modify: `apps/web/src/app/alerts/page.tsx:1-56`
- Modify: `apps/web/src/features/alerts/alert-card.tsx:1-70`
- Modify: `packages/ui/src/styles/globals.css:9-118` only if warning/success semantic tokens are not available

**Interfaces:**
- Consumes: `AlertSeverityFilter`, `filterAlertsBySeverity`, and `normalizeAlertSeverity`.
- Produces: Controlled filter UI, filtered card list, translated importance labels, and red/yellow/green badges.

- [ ] **Step 1: Add the controlled filter state and UI**

  In `AlertsInbox`, import `useState`, `ToggleGroup`, `ToggleGroupItem`, `AlertSeverityFilter`, and `filterAlertsBySeverity`. Initialize `const [severityFilter, setSeverityFilter] = useState<AlertSeverityFilter>("all")`, derive `filteredAlerts` with a direct function call, and render the filter before the list:

  ```tsx
  <ToggleGroup
    multiple={false}
    value={[severityFilter]}
    onValueChange={(value) => {
      const nextValue = value[0];
      if (nextValue === "all" || nextValue === "urgent" || nextValue === "warning" || nextValue === "info") {
        setSeverityFilter(nextValue);
      }
    }}
    variant="outline"
    size="sm"
    className="max-w-full overflow-x-auto"
    aria-label="Filtrar alertas por importancia"
  >
    <ToggleGroupItem value="all">Todas</ToggleGroupItem>
    <ToggleGroupItem value="urgent">Alta</ToggleGroupItem>
    <ToggleGroupItem value="warning">Media</ToggleGroupItem>
    <ToggleGroupItem value="info">Baja</ToggleGroupItem>
  </ToggleGroup>
  ```

  Keep loading and error states unchanged. Check `filteredAlerts.length` after the original empty-data check and render `Empty` with `No hay alertas para este filtro` when a selected level has no matches. Map over `filteredAlerts`, not the unfiltered response.

- [ ] **Step 2: Update the card badge to use the normalized three-level presentation**

  In `AlertCard`, use `normalizeAlertSeverity(alert.severity)` and render the user-facing label instead of exposing `high`, `urgent`, `warning`, or `info` directly. Keep the existing action buttons and callbacks exactly as they are. Use semantic classes for the badge states:

  ```tsx
  const SEVERITY_PRESENTATION = {
    urgent: { label: "Alta", className: "bg-destructive/10 text-destructive" },
    warning: { label: "Media", className: "bg-warning/15 text-warning-foreground" },
    info: { label: "Baja", className: "bg-success/15 text-success-foreground" },
  } as const;
  ```

  Legacy `high` resolves through `normalizeAlertSeverity("high")` to the red Alta presentation. Use the existing fallback presentation for an unknown runtime severity so an unexpected record remains visible.

- [ ] **Step 3: Add semantic warning and success theme tokens**

  Add `warning`, `warning-foreground`, `success`, and `success-foreground` variables to both `:root` and `.dark` in `packages/ui/src/styles/globals.css`, then expose them in `@theme inline` as `--color-warning`, `--color-warning-foreground`, `--color-success`, and `--color-success-foreground`. Use accessible yellow and green values that preserve readable foreground text in both themes; keep the existing destructive token for red.

- [ ] **Step 4: Verify the UI behavior manually**

  Open `/alerts` on port `3001` and verify:

  - `Todas` is active initially and all loaded alerts render.
  - `Alta`, `Media`, and `Baja` show only their corresponding cards.
  - Legacy `high` appears under Alta and uses red.
  - The card badges show Alta/red, Media/yellow, and Baja/green.
  - The filter remains usable on mobile without page-level horizontal overflow.
  - Existing `Descartar` and `Resolver` actions remain next to the severity badge and still work.

### Task 4: Make alert visibility global for readable roles

**Files:**
- Modify: `packages/api/src/alerts/services/list-alerts.ts:18-57`
- Modify: `packages/api/src/alerts/services/count-alerts.ts:5-29`
- Modify: `packages/api/src/routers/alerts.ts:46-66`
- Modify: `packages/api/src/routers/alerts.test.ts:136-190`

**Interfaces:**
- Consumes: Existing `alerts:read` permission gate, `listAlerts`, and `countAlerts` procedures.
- Produces: All callers admitted by `alerts:read` see and count only pending alerts for every `targetUserId`; mutation authorization remains unchanged.

- [ ] **Step 1: Change the API tests first**

  Rename the existing non-admin list test from `lists unresolved alerts scoped to the requesting user` to `lists unresolved alerts for all users`. Keep the own-alert assertion and change the other-user assertion to `toContain(otherAlertId)`. Keep dismissed and resolved alerts excluded, including when historical flags are sent.

  Add a count test that creates one unresolved alert for the caller and one unresolved alert for another user, records the count before insertion, calls `caller.alerts.countAlerts()`, and expects the result to equal the previous count plus two. This proves the count no longer applies the caller's `targetUserId` restriction.

  Add a regression test proving a non-admin caller cannot resolve another user's alert, and add an explicit `targetUserId` list test proving that filter still narrows global pending results.

- [ ] **Step 2: Run the focused API tests and confirm the visibility assertions fail**

  Run:

  ```bash
  pnpm --filter @crm-fran/api exec vitest run src/routers/alerts.test.ts
  ```

  Expected: FAIL because non-admin list/count currently restrict results to the requesting user.

- [ ] **Step 3: Remove user scoping from list and count reads**

  In `listAlerts`, keep the optional explicit `targetUserId` filter, ordering, limit, offset, and existing input shape. Remove the automatic `targetUserId = actorId` condition for non-admin callers, and always apply `isNull(alerts.dismissedAt)` plus `isNull(alerts.resolvedAt)` regardless of historical flags so Alert reads remain pending-only. The `alertsRouter.listAlerts` permission gate remains `permittedProcedure(["alerts:read"])`.

  In `countAlerts`, keep the existing callable signature compatibility but remove the admin/actor branching so it counts every unresolved and undismissed alert. Keep the router permission gate unchanged.

  Do not change `dismissAlert`, `resolveAlert`, or their `isAdmin` checks; users may see another user's pending alert without gaining mutation access.

- [ ] **Step 4: Run the focused API tests and verify visibility behavior**

  Run the same Vitest command from Step 2. Expected: list and count tests pass, while dismissed and resolved alerts remain excluded.

### Task 5: Run the complete verification suite

**Files:**
- Verify: `packages/db/src/schema/alerts.ts`
- Verify: `packages/api/src/alerts/services/config.ts`
- Verify: `apps/web/src/features/alerts/alert-importance.ts`
- Verify: `apps/web/src/app/alerts/page.tsx`
- Verify: `apps/web/src/features/alerts/alert-card.tsx`
- Verify: `packages/api/src/alerts/services/list-alerts.ts`
- Verify: `packages/api/src/alerts/services/count-alerts.ts`
- Verify: `packages/api/src/routers/alerts.ts`
- Verify: `packages/api/src/routers/alerts.test.ts`
- Verify: `packages/ui/src/styles/globals.css`

**Interfaces:**
- Consumes: Completed domain, helper, and UI changes.
- Produces: Verified working tree with no unintended file changes.

- [ ] **Step 1: Run the full typecheck**

  Run:

  ```bash
  pnpm check-types
  ```

  Expected: all workspace typechecks pass.

- [ ] **Step 2: Run all workspace tests**

  Run:

  ```bash
  pnpm -r test
  ```

  Expected: every configured package test command exits successfully; packages with no tests may report zero test files because `passWithNoTests` is enabled.

- [ ] **Step 3: Check the final diff and working-tree scope**

  Run:

  ```bash
  git diff --check
  git status --short
  git diff -- apps/web/src/app/alerts/page.tsx apps/web/src/features/alerts/alert-card.tsx packages/db/src/schema/alerts.ts packages/api/src/alerts/services/config.ts
  ```

  Confirm that the prior alert action layout remains intact, `high` is removed from the current domain/config/expectations while remaining only in the intentional legacy-normalization paths, and no commit or integration action is performed.

## Verification Summary

- Domain: three current severities, `no_contact` defaults to `urgent`, legacy `high` remains visible as Alta.
- UI: controlled four-option filter, local filtering, responsive mobile behavior.
- Colors: semantic red/yellow/green severity tokens.
- Tests: targeted red-green helper/domain tests, then `pnpm check-types` and `pnpm -r test`.
