# Leads Response Filter

Add an independent frontend-only filter for the caller response status in the
Leads view. Reuse the same pure response-status logic as the `Respuesta` table
column so filtering and display always agree.

## Quick path

1. Centralize caller response derivation as `Si`, `No`, or `Sin asignar`.
2. Add a response Select with `Todas las respuestas` as its inactive state.
3. Apply the response predicate independently from date and closer predicates.
4. Keep the existing backend queries and all existing filter values unchanged.

## Details

| Topic | Decision |
|-------|----------|
| Data source | Loaded lead `questions` array. |
| Response values | `Si`, `No`, and `Sin asignar`. |
| Initial state | `Todas las respuestas`; no response predicate is applied. |
| Shared logic | The table column and response filter use the same pure derivation function. |
| Filter independence | Response, date, and closer filters own separate state and predicates. |
| Combined result | When multiple filters are active, a row must satisfy every active predicate. |
| Backend | No changes or additional requests. |

## Acceptance criteria

- [ ] The response filter displays `Todas las respuestas`, `Si`, `No`, and `Sin asignar`.
- [ ] The default response state shows all loaded rows.
- [ ] Selecting `Si` shows only caller-answered `Si` rows.
- [ ] Selecting `No` shows only caller-answered `No` rows.
- [ ] Selecting `Sin asignar` shows only rows without a valid caller response.
- [ ] Response filtering works independently and combines correctly with date and closer filters.
- [ ] The response column and response filter use identical status semantics.
- [ ] No backend or query changes are introduced.

## Verification

- Add focused tests for response options, each response state, default behavior,
  and combination with another filter.
- Run the configured typecheck and full test suite.
- Run `git diff --check`.
