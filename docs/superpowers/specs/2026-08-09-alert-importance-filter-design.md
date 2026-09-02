# Alert Importance Filter

Add a three-level importance model and a responsive filter to the alerts tab. Users will be able to show all alerts or filter by Alta, Media, and Baja, with red, yellow, and green severity colors ordered from most to least urgent.

## Quick path

1. Remove the obsolete `high` severity from the alert domain and make `no_contact` use `urgent`.
2. Normalize the UI to the three user-facing levels: Alta, Media, and Baja.
3. Add a responsive `ToggleGroup` with `Todas`, `Alta`, `Media`, and `Baja`; select `Todas` by default.
4. Filter the currently loaded alert collection locally and preserve the existing alert mutations.
5. Treat legacy persisted `high` values as Alta so existing alerts remain visible.
6. Let every role with `alerts:read` see pending alerts from every user; keep mutation authorization unchanged.

## Details

| Area | Decision |
|------|----------|
| User-facing levels | Alta, Media, Baja only. The internal `high` level is removed. |
| Mapping | `urgent` → Alta/red, `warning` → Media/yellow, `info` → Baja/green. |
| Legacy data | Persisted `high` values are classified as Alta during UI normalization instead of being hidden. |
| Default filter | `Todas`, so entering the page does not hide alerts. |
| Filter control | Use the existing shadcn `ToggleGroup` pattern because the filter is a mutually exclusive set of four options. |
| Filter execution | Local filtering over the existing list response; the page currently loads alerts without pagination. |
| Alert visibility | `listAlerts` and `countAlerts` return only pending alerts across all users for any caller allowed through `alerts:read`; dismissed/resolved history remains in Leads. |
| Alert mutations | `dismissAlert` and `resolveAlert` keep their existing assigned-user/admin authorization checks. |
| Responsive behavior | The filter can wrap or scroll horizontally on mobile without causing page overflow. |
| Colors | Use the project's semantic design tokens for red, yellow, and green severity states; do not add raw color literals if matching semantic tokens exist. |
| Scope | Update alert severity definitions/defaults, affected tests, alert card presentation, and the alerts page filter. No changes to dismiss/resolve behavior. |

## Acceptance checklist

- [ ] `ALERT_SEVERITY` exposes only `INFO`, `WARNING`, and `URGENT`.
- [ ] `no_contact` alerts default to `urgent` rather than `high`.
- [ ] The page offers `Todas`, `Alta`, `Media`, and `Baja`.
- [ ] `Todas` is selected on first render and shows every loaded alert.
- [ ] Alta, Media, and Baja show only their mapped alerts.
- [ ] Severity badges use red, yellow, and green in that urgency order.
- [ ] Legacy `high` alerts remain visible as Alta.
- [ ] Any role with `alerts:read` can list pending alerts assigned to any user.
- [ ] The alerts counter includes pending alerts assigned to any user.
- [ ] Alert reads do not expose dismissed or resolved history, even if historical flags are sent.
- [ ] Dismiss and resolve authorization remains unchanged for alerts owned by another user.
- [ ] The control remains usable on mobile without horizontal page overflow.
- [ ] Existing dismiss and resolve callbacks remain unchanged.
- [ ] Existing typecheck and tests pass after updating affected expectations.

## Next step

After this design is reviewed, create the implementation plan for the domain cleanup, UI filter, tests, and verification.
