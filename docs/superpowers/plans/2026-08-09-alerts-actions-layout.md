# Compact Alert Actions Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the vertical height of alert cards by placing `Descartar` and `Resolver` immediately to the left of the severity badge in the header while keeping the layout readable on mobile.

**Architecture:** Keep the existing `AlertCard` component, callbacks, button variants, labels, and data flow unchanged. Move the action group into the existing header control area beside the severity badge; make the header wrap on small screens so the title block and controls remain readable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shared shadcn/ui `Card` and `Button` components.

## Global Constraints

- Modify only `apps/web/src/features/alerts/alert-card.tsx` for the implementation.
- Keep `onDismiss(alert.id)` and `onResolve(alert.id)` unchanged.
- Keep `Descartar` as `variant="outline"`, `Resolver` as the default button, and both buttons as `size="sm"`.
- Use responsive Tailwind layout classes and semantic existing component styles; do not add dependencies or change shared UI primitives.
- Preserve alert fetching, mutation behavior, routing, labels, and data contracts.
- Do not introduce manual `useMemo` or `useCallback`.

---

### Task 1: Reflow the alert card actions and information

**Files:**
- Modify: `apps/web/src/features/alerts/alert-card.tsx:30-68`
- Test: No new automated test file; this is a presentational rearrangement of an existing component with no component-test harness in the project.

**Interfaces:**
- Consumes: Existing `AlertCardProps`, `alert`, `onDismiss`, and `onResolve` values.
- Produces: The same rendered alert content and callbacks with responsive layout only.

- [ ] **Step 1: Move the actions beside the severity badge**

  Keep the existing `CardContent` unchanged. Update the header's right-side control area so it contains the buttons followed by the severity badge. Make the header's inner layout responsive: keep the title block and controls on one row when there is room, and allow them to use separate rows on small screens. Use a flexible control group so the buttons and badge stay together and avoid horizontal overflow.

  Preserve the existing button markup and callbacks:

  ```tsx
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0 flex flex-col gap-1">
      <CardTitle>{alert.lead?.name ?? "Lead"}</CardTitle>
      <CardDescription>
        {alert.targetUser?.name ?? "Sin asignar"}
      </CardDescription>
    </div>

    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onDismiss(alert.id)}
      >
        Descartar
      </Button>
      <Button size="sm" onClick={() => onResolve(alert.id)}>
        Resolver
      </Button>
      <Badge variant={SEVERITY_VARIANT[severity] ?? "default"}>
        {alert.severity}
      </Badge>
    </div>
  </div>
  ```

  Remove the old standalone badge markup after moving it into the control group. Do not change the alert text or action behavior.

- [ ] **Step 2: Run the project typecheck**

  Run:

  ```bash
  pnpm check-types
  ```

  Expected: the workspace typecheck completes successfully with no new errors.

- [ ] **Step 3: Perform the responsive visual check**

  Open `/alerts` at the project development port `3001` and verify:

  - At desktop width, the right side of the header reads `Descartar`, `Resolver`, then the severity badge.
  - At mobile width, the title block and controls can use separate rows, while the buttons and badge remain together.
  - Long alert messages wrap within the card and do not create horizontal overflow.
  - Clicking `Descartar` and `Resolver` still triggers the existing mutations.

- [ ] **Step 4: Review the diff for scope**

  Run:

  ```bash
  git diff -- apps/web/src/features/alerts/alert-card.tsx
  ```

  Confirm that only the alert-card presentation and its now-unused imports changed.

## Verification Summary

- Type safety: `pnpm check-types`
- Responsive behavior: manual `/alerts` check at desktop and mobile widths
- Scope safety: `git diff -- apps/web/src/features/alerts/alert-card.tsx`
