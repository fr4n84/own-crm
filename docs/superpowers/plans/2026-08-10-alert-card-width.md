# Responsive Alert Card Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the alert-card list and make it slightly narrower on desktop while keeping it full-width on mobile.

**Architecture:** Change only the alerts page list wrapper. The filters remain outside that wrapper at their current width; the card grid receives `w-full max-w-5xl mx-auto` so it constrains naturally on larger screens and expands to the viewport on mobile.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4.

## Global Constraints

- Modify only `apps/web/src/app/alerts/page.tsx`.
- Preserve all alert data, filters, actions, countdown behavior, and mutation callbacks.
- Use responsive utility classes; do not change shared Card components or add dependencies.
- Do not commit, push, merge, or create a PR automatically.

---

### Task 1: Constrain and center the alert-card grid

**Files:**
- Modify: `apps/web/src/app/alerts/page.tsx:137-146`

**Interfaces:**
- Consumes: The existing `filteredAlerts` map.
- Produces: A centered alert list with a desktop max width and mobile full width.

- [ ] **Step 1: Apply the responsive wrapper classes**

  Change only the grid wrapper around `filteredAlerts.map(...)` from:

  ```tsx
  <div className="grid gap-4">
  ```

  to:

  ```tsx
  <div className="mx-auto grid w-full max-w-5xl gap-4">
  ```

  Keep every `AlertCard`, key, callback, and filter condition unchanged.

- [ ] **Step 2: Run focused verification**

  Run:

  ```bash
  pnpm --filter web exec vitest run src/features/alerts
  pnpm check-types
  git diff --check
  ```

  Manually verify `/alerts` at desktop and mobile widths: cards are centered and narrower on desktop, full-width on mobile, and filters remain unchanged.

## Verification Summary

- Scope: one page wrapper only.
- Responsive behavior: `w-full` on mobile and `max-w-5xl mx-auto` on larger widths.
- Regression safety: existing alert behavior and UI controls remain unchanged.
