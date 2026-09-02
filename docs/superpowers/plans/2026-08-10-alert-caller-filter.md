# Alert Caller Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local caller filter that works for both alert kinds, defaults to `Todos los callers`, and composes with the existing importance filter.

**Architecture:** Enrich the existing alert relation response with the lead's caller identity, without adding a server-side caller filter. Normalize the caller in the existing frontend alert selector, expose pure tested helpers for caller extraction/filtering, and compose a responsive `Select` with the existing importance `ToggleGroup`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, tRPC v11, Drizzle ORM, Vitest, Tailwind CSS v4, and shared shadcn/ui `Select` components.

## Global Constraints

- Keep caller filtering entirely in the frontend; do not add caller filter input to the API.
- Use the lead's caller for both `No contact` and `Seguimiento`; never use `targetUser` as the caller source.
- Default to `Todos los callers` and represent it with the stable filter value `all`.
- Compare caller IDs; caller names are display labels only.
- Keep alerts without a caller visible under `Todos los callers`; exclude them for a specific caller selection.
- Preserve the existing importance filter, global pending visibility, action placement, mutation authorization, and counter invalidation.
- Keep the filter row responsive and free of page-level horizontal overflow.
- Use the existing shadcn `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem` components.
- Do not introduce manual `useMemo` or `useCallback`.
- Create local commits per delegated task; do not push, merge, or create a PR automatically.

---

### Task 1: Include lead caller identity in alert responses

**Files:**
- Modify: `packages/api/src/alerts/services/list-alerts.ts:35-40`
- Modify: `packages/api/src/routers/alerts.test.ts` in the pending global-list tests

**Interfaces:**
- Consumes: Existing `listAlerts` relation loading and pending-only filters.
- Produces: Each returned alert includes `lead.caller` with `{ id, name }` or `null`; no caller filter input is added.

- [ ] **Step 1: Add the failing response assertion**

  In the existing API list test, create or update a lead with a known `callerId`, create a pending alert for it, call `caller.alerts.listAlerts()`, and assert the returned item includes:

  ```ts
  expect(result[0]?.lead?.caller).toEqual({
    id: callerId,
    name: "Caller A",
  });
  ```

  Keep the test's global visibility and pending-only assertions intact.

- [ ] **Step 2: Run the focused API test and confirm it fails**

  Run:

  ```bash
  pnpm --filter @crm-fran/api exec vitest run src/routers/alerts.test.ts
  ```

  Expected: FAIL because `listAlerts` currently loads the lead without its caller relation.

- [ ] **Step 3: Enrich only the existing lead relation**

  Update the Drizzle relation loading in `listAlerts` from a plain lead relation to a nested caller relation:

  ```ts
  with: {
    lead: {
      with: {
        caller: true,
      },
    },
    targetUser: true,
  },
  ```

  Do not add a caller condition, caller input, or server-side filtering.

- [ ] **Step 4: Run the focused API test and verify it passes**

  Run the same command from Step 2. Expected: the caller identity assertion and all existing alert API tests pass.

### Task 2: Add tested frontend caller normalization and filtering

**Files:**
- Create: `apps/web/src/features/alerts/alert-caller.ts`
- Create: `apps/web/src/features/alerts/alert-caller.test.ts`
- Modify: `apps/web/src/features/alerts/use-alerts.ts:8-40`

**Interfaces:**
- Consumes: API alert rows containing `lead.caller: { id, name } | null`.
- Produces: `AlertCallerFilter`, `getAlertCallers`, and `filterAlertsByCaller`; `Alert` includes normalized caller data.

- [ ] **Step 1: Write failing pure-function tests**

  Add tests for deduplication, default/all behavior, selected-caller filtering, and missing callers:

  ```ts
  import { describe, expect, it } from "vitest";

  import { filterAlertsByCaller, getAlertCallers } from "./alert-caller";

  const alerts = [
    { id: "a", lead: { caller: { id: "caller-1", name: "Ana" } } },
    { id: "b", lead: { caller: { id: "caller-1", name: "Ana" } } },
    { id: "c", lead: { caller: { id: "caller-2", name: "Bruno" } } },
    { id: "d", lead: { caller: null } },
  ];

  it("returns unique callers in display order", () => {
    expect(getAlertCallers(alerts)).toEqual([
      { id: "caller-1", name: "Ana" },
      { id: "caller-2", name: "Bruno" },
    ]);
  });

  it("shows all alerts for all and only the selected caller otherwise", () => {
    expect(filterAlertsByCaller(alerts, "all")).toEqual(alerts);
    expect(filterAlertsByCaller(alerts, "caller-1").map((alert) => alert.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterAlertsByCaller(alerts, "caller-2").map((alert) => alert.id)).toEqual([
      "c",
    ]);
  });
  ```

- [ ] **Step 2: Run the new test and confirm it fails because the helper is missing**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts/alert-caller.test.ts
  ```

  Expected: FAIL with the missing module or missing export error.

- [ ] **Step 3: Implement the pure caller helper**

  Export the following API:

  ```ts
  export type AlertCallerFilter = "all" | string;
  export type AlertCaller = { id: string; name: string };

  type AlertWithCaller = {
    lead: { caller: AlertCaller | null } | null;
  };

  export function getAlertCallers<T extends AlertWithCaller>(
    alerts: readonly T[],
  ): AlertCaller[];

  export function filterAlertsByCaller<T extends AlertWithCaller>(
    alerts: readonly T[],
    callerFilter: AlertCallerFilter,
  ): T[];
  ```

  `getAlertCallers` must deduplicate by ID while retaining the first display order. `filterAlertsByCaller` must return a new array for `all`, compare IDs for a specific caller, and exclude `lead.caller === null` from specific selections.

- [ ] **Step 4: Extend the frontend `Alert` normalization**

  Update the `Alert` type and `useAlerts` selector so `lead` becomes:

  ```ts
  lead: {
    name: string;
    caller: { id: string; name: string } | null;
  } | null;
  ```

  Copy `alert.lead?.caller` into the selector output without changing the existing severity, target user, mutation, or query behavior.

- [ ] **Step 5: Run the helper test and focused web tests**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts/alert-caller.test.ts
  pnpm --filter web exec vitest run src/features/alerts
  ```

  Expected: all caller helper and existing alert feature tests pass.

### Task 3: Compose the caller filter with the existing importance filter

**Files:**
- Modify: `apps/web/src/app/alerts/page.tsx:1-100`
- Modify: `apps/web/src/features/alerts/alert-card.tsx:27-63`

**Interfaces:**
- Consumes: `AlertCallerFilter`, `getAlertCallers`, `filterAlertsByCaller`, existing severity filter helpers, and normalized `Alert` caller data.
- Produces: Responsive caller `Select`, combined local filtering, and consistent caller display for both alert kinds.

- [ ] **Step 1: Add caller filter state and options**

  In `AlertsInbox`, initialize `const [callerFilter, setCallerFilter] = useState<AlertCallerFilter>("all")`. Derive `callers` from the loaded `data` with `getAlertCallers(data ?? [])`. Render a controlled Select with the existing Base UI API:

  ```tsx
  <Select
    value={callerFilter}
    onValueChange={(value) => setCallerFilter(value ?? "all")}
  >
    <SelectTrigger
      size="sm"
      className="w-full sm:w-52"
      aria-label="Filtrar alertas por caller"
    >
      <SelectValue placeholder="Todos los callers" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Todos los callers</SelectItem>
      {callers.map((caller) => (
        <SelectItem key={caller.id} value={caller.id}>
          {caller.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  ```

  Keep `all` selected on initial render and render the controls in a wrapping row with the existing importance filter.

- [ ] **Step 2: Combine both local filters**

  Apply the existing severity filter first, then caller filtering:

  ```ts
  const severityFilteredAlerts = filterAlertsBySeverity(
    data ?? [],
    severityFilter,
  );
  const filteredAlerts = filterAlertsByCaller(
    severityFilteredAlerts,
    callerFilter,
  );
  ```

  Preserve the existing empty states: no loaded alerts uses `No hay alertas pendientes`; no matches after either filter uses `No hay alertas para este filtro`.

- [ ] **Step 3: Display the lead caller consistently**

  In `AlertCard`, keep the existing action buttons and severity badge unchanged, but update the header description to show the lead caller for both alert kinds:

  ```tsx
  <CardDescription>
    Caller: {alert.lead?.caller?.name ?? "Sin caller"}
  </CardDescription>
  ```

  Do not use `targetUser` for this display or filter.

- [ ] **Step 4: Run focused verification**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts
  pnpm check-types
  git diff --check
  ```

  Manually verify `/alerts` on desktop and mobile: `Todos los callers` shows all alerts, a selected caller narrows both alert kinds, the importance filter still composes, and the controls do not create page-level horizontal overflow.

### Task 4: Final verification

**Files:**
- Verify: `packages/api/src/alerts/services/list-alerts.ts`
- Verify: `apps/web/src/features/alerts/use-alerts.ts`
- Verify: `apps/web/src/features/alerts/alert-caller.ts`
- Verify: `apps/web/src/app/alerts/page.tsx`
- Verify: `apps/web/src/features/alerts/alert-card.tsx`

**Interfaces:**
- Consumes: Completed caller enrichment, pure helper, and responsive UI.
- Produces: Verified frontend-only caller filtering with unchanged alert behavior.

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
  git diff -- apps/web/src/app/alerts/page.tsx apps/web/src/features/alerts/alert-card.tsx apps/web/src/features/alerts/use-alerts.ts apps/web/src/features/alerts/alert-caller.ts packages/api/src/alerts/services/list-alerts.ts packages/api/src/routers/alerts.test.ts
  ```

  Confirm there is no caller filter input or server-side caller condition, no Leads file changed, and the existing importance/global-visibility changes remain intact.

## Verification Summary

- Data: lead caller identity is included without server-side filtering.
- Logic: caller IDs are deduplicated and locally matched; missing callers remain visible only under all.
- UI: responsive `Select` composed with the importance filter.
- Regression safety: existing alert actions, visibility, severity, and counter behavior remain unchanged.
