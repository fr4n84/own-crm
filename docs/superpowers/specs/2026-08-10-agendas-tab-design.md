# Agendas Tab

Add a new `/agendas` tab visible to every role with lead-read access. The tab reuses the global leads query, filters locally to caller Q&A outcome `Agenda`, and renders a dedicated responsive table with caller, closer, date, and time.

## Quick path

1. Add `Agendas` to the shared sidebar navigation.
2. Load the global `leads.listAll` query for every permitted role.
3. Extract agenda metadata from caller-authored Q&A items.
4. Filter to leads with `callerOutcome = Agenda`.
5. Render the agenda-specific table and empty state.

## Details

| Topic | Decision |
|-------|----------|
| Route | `/agendas`. |
| Access | Existing `leads:read` permission boundary; no role-specific filtering. |
| Data source | Existing global `leads.listAll` query; no new endpoint. |
| Detection | Caller-authored `questionKey: "callerOutcome"` with answer `Agenda`. |
| Metadata | Caller/closer relations plus caller Q&A `scheduledDate` and `scheduledTime`. |
| Table | Existing `DataTable` pattern with Lead, Caller, Closer, Fecha, and Hora columns. |
| Empty state | Clear empty state when no agenda leads exist. |
| Responsive behavior | Horizontal scrolling is allowed inside the table on mobile, not across the entire page. |
| Scope | Do not change lead assignment, alerts, closer Q&A, or existing Leads page behavior. |

## Acceptance checklist

- [ ] Sidebar shows `Agendas` linking to `/agendas`.
- [ ] Every role with `leads:read` can load the tab.
- [ ] Only leads with caller outcome `Agenda` are shown.
- [ ] Caller and closer names are displayed.
- [ ] Agenda date and time are displayed from stored Q&A values.
- [ ] Other outcomes are excluded.
- [ ] Empty state appears when there are no agendas.
- [ ] The table remains usable on mobile.
- [ ] Existing Leads and Alerts behavior is unchanged.

## Next step

After this design is reviewed, create the implementation plan for agenda extraction, page/route creation, shared navigation, table columns, tests, and responsive verification.
