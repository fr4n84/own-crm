# Leads User Name Columns

Replace the visible `callerId` and `closerId` values in the Leads table and the
visible closer-filter options with the related users' names. The existing lead
query already returns both user relations, so this is a frontend presentation
change with no new request or backend contract.

## Quick path

1. Read `row.original.caller?.name` and `row.original.closer?.name` in the
   existing column definitions.
2. Show `Sin asignar` when a relation is null or missing.
3. Rename the headers to `Caller` and `Closer`.
4. Build closer-filter options as `{ value: closerId, label: closerName }` so
   filtering still compares IDs while the UI displays names.
5. Add focused column and Leads-page tests for assigned and missing relations.

## Details

| Topic | Decision |
|-------|----------|
| Data source | Use the existing nested `caller` and `closer` objects returned with each lead. |
| Visible caller value | `caller.name`, or `Sin asignar` when unavailable. |
| Visible closer value | `closer.name`, or `Sin asignar` when unavailable. |
| Visible IDs | Do not render the long raw IDs in the table cells. |
| Closer filter value | Keep the raw `closerId` as the Select value used by the predicate. |
| Closer filter label | Display `closer.name`, or `Sin asignar` when the relation/name is unavailable. |
| Backend | No changes; no additional user query. |
| Existing filters | Date and closerId filtering remain unchanged. |

## Acceptance criteria

- [ ] Assigned callers display their names instead of IDs.
- [ ] Assigned closers display their names instead of IDs.
- [ ] Null or missing caller/closer relations display `Sin asignar`.
- [ ] Column headers no longer advertise raw IDs.
- [ ] The closer filter displays names while retaining IDs as internal values.
- [ ] Existing Leads filters and actions remain unchanged.
- [ ] No backend files or additional requests are introduced.

## Verification

- Run focused column tests.
- Run the configured typecheck and full test suite.
- Run `git diff --check`.
