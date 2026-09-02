# Proposal: Leads Date Range Filter

## Intent

The leads page currently displays all leads with no filtering capability. Users need to filter leads by creation date to focus on specific time periods (e.g., leads from last week, last month, or a custom range). This is especially critical for admins reviewing performance across different periods and for sales reps tracking their recent activity.

## Scope

### In Scope
- Date range picker UI component (from/to dates) positioned above the DataTable
- Server-side filtering via tRPC procedure input parameters
- WHERE clause construction with `gte(createdAt, from)` and `lte(createdAt, to)`
- Support for both `listAll` (admin) and `listByUserId` (non-admin) procedures
- Default behavior: show all leads when no filter is applied

### Out of Scope
- URL persistence of filter state
- Preset options (7/14/30 days) — can be added later
- Filter by day of week
- Filter state persistence across navigation

## Capabilities

### New Capabilities
- `leads-date-filter`: Date range filtering for leads list, allowing users to specify from/to dates to filter leads by creation timestamp

### Modified Capabilities
None

## Approach

1. **UI Layer**: Add shadcn Calendar + Popover components to create a date range picker. Place above DataTable in `apps/web/src/app/leads/page.tsx`.

2. **API Layer**: Add optional `dateRange` input to `listAll` and `listByUserId` procedures with schema:
   ```typescript
   dateRange: z.object({
     from: z.string().optional(),
     to: z.string().optional()
   }).optional()
   ```

3. **Service Layer**: Update `getAll()` and `getByUserId()` to accept optional date range parameters. Build WHERE clause combining existing filters with date conditions using `and()`.

4. **Database Layer**: Export `gte` from `packages/db/src/index.ts` (already has `lte`). Use `gte(createdAt, from)` and `lte(createdAt, to)` in query construction.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/app/leads/page.tsx` | Modified | Add date range picker UI, manage filter state, pass to tRPC queries |
| `packages/api/src/routers/leads.ts` | Modified | Add `dateRange` input schema to `listAll` and `listByUserId` |
| `packages/api/src/leads/services/get-all.ts` | Modified | Accept and apply optional date range filter |
| `packages/api/src/leads/services/get-by-user.ts` | Modified | Accept and apply optional date range filter |
| `packages/db/src/index.ts` | Modified | Export `gte` operator from drizzle-orm |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Need to install shadcn Calendar + Popover components | High | Run `pnpm dlx shadcn@latest add calendar popover` in `packages/ui` |
| First filter establishes pattern for future filters | Medium | Keep implementation clean and reusable; document approach |
| Pre-existing hooks violation in page.tsx (conditional useQuery) | Low | Out of scope for this change, but note it for future cleanup |
| Date validation (from > to) | Medium | Add client-side validation to prevent invalid ranges |

## Rollback Plan

1. Revert all file changes via git
2. No database migrations involved
3. No breaking changes to existing API contracts (dateRange is optional)
4. Safe to rollback at any point

## Dependencies

- shadcn Calendar component (needs installation)
- shadcn Popover component (needs installation)

## Success Criteria

- [ ] Users can select a date range (from/to) on the leads page
- [ ] Leads are filtered by `createdAt` within the selected range
- [ ] Default view (no filter) shows all leads as before
- [ ] Filter works for both admin (listAll) and non-admin (listByUserId) views
- [ ] Invalid date ranges (from > to) are prevented or handled gracefully
- [ ] Type checking passes with `pnpm check-types`
