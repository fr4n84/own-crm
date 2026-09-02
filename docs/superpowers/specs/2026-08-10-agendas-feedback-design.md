# Agendas Feedback and Closer Actions

Extend the Agendas table with the lead phone and caller feedback, and provide two independent actions: one read-only caller-feedback view and one closer-feedback form. The caller feedback must never be editable from the closer form.

## Quick path

1. Add Teléfono and Feedback del caller columns to Agendas.
2. Keep caller feedback sourced from `lead.feedback` and display it read-only.
3. Add a read-only action that displays caller feedback.
4. Add a separate closer action/form with a `Feedback del closer` field.
5. Persist closer feedback without modifying caller feedback.

## Details

| Topic | Decision |
|-------|----------|
| Caller feedback | Existing `lead.feedback` field; display-only in Agendas. |
| Closer feedback | New caller-independent Q&A item with `questionKey: "closerFeedback"` and `authorRole: "closer"`. |
| Actions | Keep separate View and Closer feedback actions; the caller feedback action is read-only, while the closer action opens the closer form. |
| Closer form | Add a `Feedback del closer` field to `CloserQAForm`; persist it through the existing `recordCloserAnswers` mutation. |
| Permissions | Keep existing role/permission behavior; do not make caller feedback editable by the closer. |
| Scope | Agendas columns/actions and closer feedback persistence only. Do not change caller feedback storage, alert behavior, or unrelated Leads/Alerts pages. |

## Acceptance checklist

- [ ] Agendas displays lead phone.
- [ ] Agendas displays caller feedback from `lead.feedback`.
- [ ] Caller feedback is read-only in the view and edit flows.
- [ ] Agendas exposes separate caller-view and closer-feedback actions.
- [ ] Closer can enter and save independent feedback from Agendas.
- [ ] Closer feedback persists as `closerFeedback` authored by the closer.
- [ ] Saving closer feedback does not overwrite caller feedback.
- [ ] Existing caller and closer Q&A behavior remains intact.
- [ ] The table and action controls remain usable on mobile.

## Next step

After this design is reviewed, create the implementation plan for columns, action wiring, closer feedback field, persistence, tests, and responsive verification.
