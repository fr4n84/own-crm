# Alert Countdown Timer

Add an informational frontend countdown to every new alert. The timer starts from the alert's creation timestamp, uses a 24-hour window for `No contact` alerts and a 12-hour window for all other alert kinds, updates every second, and remains visible as a red negative duration after expiration.

## Quick path

1. Preserve the alert creation timestamp in the frontend `Alert` model and selector.
2. Calculate the deadline locally from `createdAt` plus the kind-specific duration.
3. Render the countdown below the action buttons and severity badge.
4. Update once per second and clean up the interval on unmount.
5. Format positive and negative durations consistently, using the destructive semantic token after expiration.

## Details

| Topic | Decision |
|-------|----------|
| Start time | `alert.createdAt`, so reloading the page does not reset the timer. |
| Duration | `no_contact` → 24 hours; every other current alert kind → 12 hours. |
| Expiration | Continue rendering after zero as a negative duration such as `-00:12:35`. |
| Update cadence | One frontend update per second with interval cleanup on unmount. |
| Placement | Below `Descartar`, `Resolver`, and the severity badge in the alert header controls. |
| Color | Normal countdown uses the default/muted text treatment; expired countdown uses the semantic `text-destructive` token. |
| Scope | Informational display only. No API filtering, database writes, alert mutation, toast, or automatic resolution changes. |
| Responsive behavior | The controls and timer may wrap on mobile without page-level horizontal overflow. |

## Acceptance checklist

- [ ] Every loaded alert shows a countdown.
- [ ] `No contact` starts with a 24-hour window from `createdAt`.
- [ ] `Seguimiento` starts with a 12-hour window from `createdAt`.
- [ ] The value updates every second.
- [ ] Positive values display remaining time in `HH:MM:SS`.
- [ ] Expired values display a negative `-HH:MM:SS` and use red semantic text.
- [ ] Reloading the page preserves the calculated deadline because it uses `createdAt`.
- [ ] Intervals are cleaned up when an alert card unmounts.
- [ ] Existing caller/importance filters, actions, severity badges, visibility, and counter behavior remain unchanged.
- [ ] The timer is readable on desktop and mobile.

## Next step

After this design is reviewed, create the implementation plan for timestamp normalization, tested countdown formatting, card integration, and verification.
