# Lead Caller Outcome Flow

Extend the caller's existing binary Q&A flow with an outcome selector. `¿Fue contactado?` remains first: `No` goes directly to the existing alert path, while `Sí` reveals `¿Qué ha sucedido?` and the previous Q&A fields. Previous questions remain optional; only `Agenda` scheduling fields and `Llamar a futuro` alert configuration are required.

## Quick path

1. Keep `¿Fue contactado?` as the first selector and preserve the direct `No` alert path.
2. For `Sí`, add `¿Qué ha sucedido?` with `Llamar a futuro`, `No encaja`, `No interesado`, and `Agenda`.
3. Keep all previous Q&A fields visible after `Sí`, but make them optional.
4. Create a one-time scheduled alert only for `Llamar a futuro`.
5. Keep the existing mutation transaction boundary.

## Details

| Outcome | Visible fields after `Sí` | Required fields | Side effect |
|---------|----------------|-----------------|-------------|
| `Llamar a futuro` | All previous Q&A fields plus exact date, exact time, importance | Outcome, date, time, importance | Create one non-recurring alert. |
| `Agenda` | All previous Q&A fields plus assigned closer, date, time | Outcome, closer, date, time | Save scheduling data; create no alert. |
| `No encaja` | All previous Q&A fields | Outcome only | Save outcome; create no alert. |
| `No interesado` | All previous Q&A fields | Outcome only | Save outcome; create no alert. |

| Topic | Decision |
|-------|----------|
| Importance mapping | Alta → `urgent`, Media → `warning`, Baja → `info`. |
| Alert kind | Use the existing `no_contact` alert kind for `Llamar a futuro`. |
| Alert recurrence | Set the scheduled alert as one-time; it must not recur automatically. |
| Persistence | Extend the existing caller assignment mutation and keep lead/question/alert writes in its transaction. |
| UI behavior | Previous Q&A fields remain visible after `Sí`; outcome-specific scheduling/configuration fields appear conditionally, and stale hidden values are cleared. |
| Validation | `No` bypasses the outcome form; previous questions are optional for every `Sí` outcome; `Agenda` requires closer/date/time, and `Llamar a futuro` requires date/time/importance. |
| Scope | Caller form and assignment mutation only. Do not change closer Q&A, alert list filters, countdown, or alert visibility rules. |

## Acceptance checklist

- [ ] `¿Fue contactado?` remains the first selector.
- [ ] `No` goes directly through the existing alert path.
- [ ] The outcome selector appears only after `Sí` and contains all four requested options.
- [ ] All previous Q&A fields reappear after `Sí` and remain optional.
- [ ] `Agenda` shows closer/date/time and no alert-importance controls.
- [ ] `Agenda` creates no alert.
- [ ] `Llamar a futuro` shows exact date/time and selectable Alta/Media/Baja importance.
- [ ] `Llamar a futuro` creates exactly one scheduled alert with the mapped severity.
- [ ] `No encaja` and `No interesado` submit without requiring any previous question.
- [ ] Changing outcomes clears hidden field values before submission.
- [ ] Existing caller Q&A persistence and transaction error handling remain intact.
- [ ] Existing closer Q&A and alert frontend behavior remain unchanged.

## Next step

After this design is reviewed, create the implementation plan for the conditional caller form, payload validation, transactional mutation, one-time alert creation, and tests.
