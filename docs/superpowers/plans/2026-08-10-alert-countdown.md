# Alert Countdown Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a frontend-only countdown below each alert's actions and severity badge, using 24 hours for `No contact`, 12 hours for other alert kinds, and red negative time after expiration.

**Architecture:** Preserve `createdAt` in the existing frontend `Alert` selector, keep duration/deadline/formatting as pure tested helpers, and update each `AlertCard` once per second with a cleaned-up interval. No API filtering, database writes, or alert mutation behavior changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Tailwind CSS v4, and shared shadcn/ui Card/Badge/Button components.

## Global Constraints

- Calculate the deadline from `createdAt`; do not use `nextShowAt` for the countdown.
- Use `no_contact` → 24 hours and every other current alert kind → 12 hours.
- Keep rendering after expiration as a negative `-HH:MM:SS` value.
- Update once per second and clear the interval when the card unmounts.
- Render the timer below `Descartar`, `Resolver`, and the severity badge.
- Use `text-destructive` after expiration; do not add raw color literals.
- Keep the timer informational only; do not mutate, dismiss, resolve, refetch, or toast.
- Preserve caller/importance filters, global pending visibility, action placement, severity badges, and counter invalidation.
- Keep the layout readable on mobile without page-level horizontal overflow.
- Do not introduce manual `useMemo` or `useCallback`.
- Keep changes on `features`; do not push, merge, or create a PR automatically.

---

### Task 1: Add tested countdown calculations and formatting

**Files:**
- Create: `apps/web/src/features/alerts/alert-countdown.ts`
- Create: `apps/web/src/features/alerts/alert-countdown.test.ts`

**Interfaces:**
- Consumes: Alert kind, creation timestamp, and an optional current timestamp for deterministic tests.
- Produces: `getAlertCountdownDuration`, `getAlertCountdownDeadline`, `getAlertCountdownRemaining`, and `formatAlertCountdown`.

- [ ] **Step 1: Write failing pure-function tests**

  Add tests for the two durations, deadline calculation, positive formatting, zero, and negative formatting:

  ```ts
  import { describe, expect, it } from "vitest";

  import {
    formatAlertCountdown,
    getAlertCountdownDeadline,
    getAlertCountdownDuration,
    getAlertCountdownRemaining,
  } from "./alert-countdown";

  describe("alert countdown", () => {
    it("uses 24 hours for no-contact and 12 hours for other kinds", () => {
      expect(getAlertCountdownDuration("no_contact")).toBe(24 * 60 * 60 * 1000);
      expect(getAlertCountdownDuration("follow_up")).toBe(12 * 60 * 60 * 1000);
    });

    it("calculates the deadline from creation time", () => {
      const createdAt = "2026-08-10T12:00:00.000Z";

      expect(getAlertCountdownDeadline(createdAt, "no_contact")).toBe(
        Date.parse("2026-08-11T12:00:00.000Z"),
      );
    });

    it("returns remaining time relative to the supplied current timestamp", () => {
      const createdAt = "2026-08-10T12:00:00.000Z";
      const now = Date.parse("2026-08-10T13:30:05.000Z");

      expect(getAlertCountdownRemaining(createdAt, "no_contact", now)).toBe(
        22 * 60 * 60 * 1000 + 29 * 60 * 1000 + 55 * 1000,
      );
    });

    it("formats positive, zero, and negative durations", () => {
      expect(formatAlertCountdown(12 * 60 * 60 * 1000 + 34 * 60 * 1000 + 56 * 1000)).toBe(
        "12:34:56",
      );
      expect(formatAlertCountdown(0)).toBe("00:00:00");
      expect(formatAlertCountdown(-12 * 60 * 1000 - 35 * 1000)).toBe(
        "-00:12:35",
      );
    });
  });
  ```

- [ ] **Step 2: Run the new test and confirm it fails because the helper is missing**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts/alert-countdown.test.ts
  ```

  Expected: FAIL with the missing module or missing export error.

- [ ] **Step 3: Implement the pure countdown helpers**

  Implement these signatures:

  ```ts
  const HOUR_MS = 60 * 60 * 1000;

  export function getAlertCountdownDuration(kind: string): number {
    return kind === "no_contact" ? 24 * HOUR_MS : 12 * HOUR_MS;
  }

  export function getAlertCountdownDeadline(
    createdAt: Date | string,
    kind: string,
  ): number {
    return new Date(createdAt).getTime() + getAlertCountdownDuration(kind);
  }

  export function getAlertCountdownRemaining(
    createdAt: Date | string,
    kind: string,
    now = Date.now(),
  ): number {
    return getAlertCountdownDeadline(createdAt, kind) - now;
  }

  export function formatAlertCountdown(milliseconds: number): string {
    const sign = milliseconds < 0 ? "-" : "";
    const totalSeconds = Math.floor(Math.abs(milliseconds) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  ```

- [ ] **Step 4: Run the helper tests and verify they pass**

  Run the same Vitest command from Step 2. Expected: all countdown helper tests pass.

### Task 2: Preserve `createdAt` in the frontend alert model

**Files:**
- Modify: `apps/web/src/features/alerts/use-alerts.ts:8-54`

**Interfaces:**
- Consumes: Existing alert rows returned by `listAlerts`.
- Produces: `Alert.createdAt: Date | string` available to `AlertCard` without changing the query or API contract.

- [ ] **Step 1: Add the timestamp to the normalized `Alert` type and selector**

  Add `createdAt: Date | string` to `Alert` and copy `alert.createdAt` in the existing `select` mapping. Do not alter caller, severity, target user, filter, mutation, or counter fields.

- [ ] **Step 2: Run the focused alert tests and typecheck**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts
  pnpm check-types
  ```

  Expected: existing alert helper tests and workspace typecheck pass.

### Task 3: Integrate the live timer into `AlertCard`

**Files:**
- Modify: `apps/web/src/features/alerts/alert-card.tsx:1-76`

**Interfaces:**
- Consumes: `Alert.createdAt`, `alert.kind`, countdown helpers, and the existing card action/severity layout.
- Produces: A live informational timer below the action row with red negative styling after expiration.

- [ ] **Step 1: Add the live timestamp state and interval cleanup**

  Import `useEffect` and `useState`. Initialize the current timestamp with `Date.now()`, update it every 1,000 milliseconds, and return `clearInterval` from the effect cleanup:

  ```tsx
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const remainingMs = getAlertCountdownRemaining(
    alert.createdAt,
    alert.kind,
    now,
  );
  const countdown = formatAlertCountdown(remainingMs);
  const isExpired = remainingMs < 0;
  ```

- [ ] **Step 2: Place the countdown below actions and severity**

  Preserve the existing `Descartar`, `Resolver`, and severity badge markup. Wrap the top control row and timer in a right-side column, then render:

  ```tsx
  <p
    className={cn(
      "text-xs tabular-nums text-muted-foreground",
      isExpired && "text-destructive",
    )}
    aria-label={`Tiempo restante: ${countdown}`}
  >
    Tiempo: {countdown}
  </p>
  ```

  Use the project's existing `cn` utility rather than a manual class-name ternary. Keep the timer below the controls on desktop and mobile.

- [ ] **Step 3: Verify focused behavior and responsive structure**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts
  pnpm check-types
  git diff --check
  ```

  Manually verify `/alerts` at desktop and mobile widths: `No contact` shows a 24-hour countdown, `Seguimiento` shows 12 hours, the timer updates, expired values are negative/red, and unmounting a card does not leave an interval running.

### Task 4: Final verification

**Files:**
- Verify: `apps/web/src/features/alerts/alert-countdown.ts`
- Verify: `apps/web/src/features/alerts/alert-countdown.test.ts`
- Verify: `apps/web/src/features/alerts/use-alerts.ts`
- Verify: `apps/web/src/features/alerts/alert-card.tsx`

**Interfaces:**
- Consumes: Completed pure helpers, timestamp normalization, and live card integration.
- Produces: Verified informational frontend-only countdown with unchanged alert behavior.

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
  git diff -- apps/web/src/features/alerts/alert-card.tsx apps/web/src/features/alerts/use-alerts.ts apps/web/src/features/alerts/alert-countdown.ts apps/web/src/features/alerts/alert-countdown.test.ts
  ```

  Confirm the change is frontend-only, no alert mutation/API filtering was added, and existing caller/importance behavior remains intact.

## Verification Summary

- Timing: deadline is derived from `createdAt` with 24h/12h kind-specific windows.
- Formatting: positive, zero, and negative `HH:MM:SS` values are tested.
- Lifecycle: one-second update interval is cleaned up on unmount.
- UI: timer is below actions/severity and uses semantic red after expiration.
