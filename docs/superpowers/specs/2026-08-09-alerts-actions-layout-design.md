# Compact Alert Actions Layout

Reposition the alert actions so `Descartar` and `Resolver` appear immediately to the left of the severity badge on the right side of each alert card header, reducing the vertical height of each alert card while preserving clear responsive behavior.

## Quick path

1. Keep the existing alert data, mutations, and button semantics unchanged.
2. Move the existing actions into the header beside the severity badge.
3. On small screens, let the title block and controls use separate rows; keep the buttons and badge together without horizontal overflow.
4. Verify the `/alerts` page at desktop and mobile widths and run the available typecheck.

## Details

| Area | Decision |
|------|----------|
| Desktop layout | The right side of the header contains `Descartar`, `Resolver`, then the severity badge. |
| Mobile layout | The title and assignee use the first row; the action buttons and severity badge use a second flexible row and may wrap naturally. |
| Actions | Keep the current `outline` styling for `Descartar`, primary styling for `Resolver`, `size="sm"`, labels, and callbacks. |
| Scope | Modify only the alert card presentation. Do not change alert fetching, mutations, routing, or data contracts. |
| Overflow | Allow the information area to shrink and wrap instead of forcing horizontal overflow. |

## Acceptance checklist

- [ ] Desktop alert cards place both action buttons immediately to the left of the severity badge.
- [ ] Mobile alert cards keep buttons and the severity badge visible without horizontal overflow.
- [ ] Existing dismiss and resolve callbacks still receive the same alert ID.
- [ ] No unrelated alert behavior or data fetching changes.
- [ ] Typecheck passes after the layout change.

## Next step

After this design is reviewed, update `apps/web/src/features/alerts/alert-card.tsx` and verify the responsive header layout.
