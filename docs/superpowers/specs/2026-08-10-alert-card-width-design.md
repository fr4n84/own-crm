# Responsive Alert Card Width

Limit the desktop width of the alert-card list and center it, while keeping the list full-width on mobile.

## Decision

- Keep the filters at their current width.
- Wrap only the alert-card grid with `w-full max-w-5xl mx-auto`.
- Preserve the existing `gap-4` spacing and all alert behavior.
- On mobile, `w-full` keeps cards responsive without horizontal overflow.

## Acceptance checklist

- [ ] Desktop alert cards are slightly narrower and centered.
- [ ] Mobile alert cards use the available width.
- [ ] Filters, countdown, actions, and alert data remain unchanged.
