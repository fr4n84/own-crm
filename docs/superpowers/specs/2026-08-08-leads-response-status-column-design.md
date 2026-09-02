# Leads Caller Response Status

Make the Leads table `Respuesta` column reflect the caller's answer to
`isContacted`. Derive the display value from the existing `questions` data so
the UI distinguishes `Si`, `No`, and an unanswered caller action without adding
backend work.

## Quick path

1. Inspect caller-authored questions from the loaded lead.
2. Use the latest caller item with `questionKey: "isContacted"`.
3. Display `Si`, `No`, or `Sin asignar` based on its answer.
4. Ignore closer-authored answers and leave other columns unchanged.

## Details

| Topic | Decision |
|-------|----------|
| Data source | Existing `questions` array on each lead. |
| Caller `Si` | Display `Si`. |
| Caller `No` | Display `No`. |
| No caller response | Display `Sin asignar`. |
| Multiple caller responses | Use the latest matching caller `isContacted` item. |
| Closer responses | Never affect this column. |
| Backend | No changes; do not rely on the existing `response` field. |

## Acceptance criteria

- [ ] A caller `isContacted` answer of `Si` renders `Si`.
- [ ] A caller `isContacted` answer of `No` renders `No`.
- [ ] No caller `isContacted` answer renders `Sin asignar`.
- [ ] Closer-authored `isContacted` items are ignored.
- [ ] The latest matching caller answer wins when multiple items exist.
- [ ] Existing filters, user-name columns, date/time columns, and actions remain unchanged.
- [ ] No backend or query changes are introduced.

## Verification

- Add focused column tests for each status and precedence case.
- Run the configured typecheck and full test suite.
- Run `git diff --check`.
