# Leads Date Range Filter — Compact Controls

## Goal

Add a compact date-range filter to `apps/web/src/app/leads/page.tsx` so the
Leads table filters records by their existing `createdAt` value.

## Design

- Keep the existing server-side date-range data flow and tRPC contract.
- Keep separate `From` and `To` calendar controls for clarity.
- Replace the fixed `w-[200px]` button width with compact content-based sizing,
  using short formatted dates such as `01 Jan 2025`.
- Keep the clear action as a small icon button and show it only when a date is
  selected.
- Preserve the existing disabled-date rules: `From` cannot be after `To`, and
  `To` cannot be before `From`.

## Scope

- Update the date-range picker presentation and its focused tests.
- Do not change the database schema, lead query projection, or unrelated lead
  page features.

## Verification

- Run the focused date-range picker tests.
- Run the relevant web typecheck.
- Confirm the Leads page renders compact controls and selecting dates refreshes
  the server-side filtered query.
