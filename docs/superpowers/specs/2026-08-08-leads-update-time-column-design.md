# Leads Update Time Column

Add a separate Leads table column that shows the local time of the last update.
Keep the existing `Actualizado en` column as the update date and reuse the
already-loaded `updatedAt` value.

## Quick path

1. Keep the existing update-date column unchanged.
2. Add `Hora de actualización` beside it.
3. Format `updatedAt` with local hour and minute values.
4. Add a focused column test.

## Details

| Topic | Decision |
|-------|----------|
| Data source | Existing `updatedAt` field from each loaded lead. |
| Date column | Preserve `Actualizado en` as the local date. |
| New column | `Hora de actualización`, showing local hour and minute. |
| Format | `toLocaleTimeString` with two-digit hour and minute. |
| Invalid value | Preserve the existing date/time formatting behavior; no backend validation is added. |
| Backend | No changes or additional requests. |

## Acceptance criteria

- [ ] The Leads table contains `Hora de actualización`.
- [ ] The new column shows the hour and minute from `updatedAt`.
- [ ] `Actualizado en` continues showing the date.
- [ ] Existing filters, user-name columns, and row actions remain unchanged.
- [ ] No backend or query changes are introduced.

## Verification

- Run focused column and Leads page tests.
- Run the configured typecheck and full test suite.
- Run `git diff --check`.
