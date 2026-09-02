# Alert Caller Filter

Add a frontend caller filter to the alerts page so users can show alerts generated from leads assigned to a specific caller. The filter applies to both `No contact` and `Seguimiento` alerts, defaults to all callers, and works together with the existing importance filter.

## Quick path

1. Include the lead's caller identity in each alert response; do not add server-side caller filtering.
2. Normalize the caller data in the existing `useAlerts` frontend selector.
3. Add a responsive caller `Select` with `Todos los callers` selected by default.
4. Filter the loaded alerts locally by stable `callerId`, not by display name or `targetUser`.
5. Display the lead's caller consistently for both alert kinds.

## Details

| Topic | Decision |
|-------|----------|
| Caller source | Use the caller assigned to `alert.lead`; `targetUser` is not a reliable caller source because it is the caller for `No contact` but the closer for `Seguimiento`. |
| Data enrichment | Extend the alert query relation to include the lead's caller identity. This is data enrichment only; filtering remains entirely in the frontend. |
| Filter control | Use the existing shadcn `Select` component because the number of callers is dynamic and can exceed a small toggle set. |
| Default | `Todos los callers`, represented by a stable `all` selection. |
| Matching | Compare caller IDs; names are display labels only. |
| Missing caller | Keep alerts with no assigned caller visible under `Todos los callers`; they are excluded when a specific caller is selected. |
| Composition | Keep the importance filter and caller filter together in a responsive filter row that can wrap on mobile without page overflow. |
| Scope | No server-side caller filter, no changes to alert permissions, mutations, severity rules, or Leads screens. |

## Acceptance checklist

- [ ] The alert response includes the lead caller's `id` and `name`.
- [ ] Both `No contact` and `Seguimiento` use the lead caller for filtering.
- [ ] `Todos los callers` is selected by default and shows every loaded alert.
- [ ] Selecting a caller shows only that caller's alerts.
- [ ] Alerts without a caller remain visible under `Todos los callers`.
- [ ] Selecting a specific caller excludes alerts without a caller.
- [ ] The existing importance filter continues to work together with the caller filter.
- [ ] The caller filter remains usable on mobile without horizontal page overflow.
- [ ] Existing dismiss, resolve, global visibility, and counter behavior remain unchanged.

## Next step

After this design is reviewed, create the implementation plan for caller data enrichment, frontend normalization, local filtering, and responsive verification.
