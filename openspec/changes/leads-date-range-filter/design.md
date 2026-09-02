# Design: Leads Date Range Filter

## Technical Approach

Add an optional date-range filter (from/to) to the leads page. The filter flows from UI → tRPC procedure → service layer → `selectLeadWithUsers(where)` query. Reuses the existing SQL-WHERE plumbing in `packages/api/src/leads/queries/leads-with-users.ts`, so service functions only need to compose an additional `and(...)` clause when dates are present.

## Architecture Decisions

| Decision | Options considered | Choice | Rationale |
|----------|-------------------|--------|-----------|
| Wire format | ISO string vs Date object vs number | ISO date string `YYYY-MM-DD` | Simplest Zod validation (`z.string().date()`), timezone-unambiguous, easy to diff in network tab |
| Time handling | Strip time in DB (`DATE(createdAt)`) vs bound to start/end of day | Compare against start-of-day / end-of-day Date in UTC | Avoids SQL `DATE()` function which bypasses indexes; `createdAt` is indexed-friendly with `gte`/`lte` |
| Filter position | UI layer vs shared lib | App-level component `apps/web/src/components/date-range-picker.tsx` | Project convention: reusable UI primitives in `packages/ui`, app-specific composition in `apps/web/src/components` |
| Calendar primitives | Custom vs shadcn | shadcn Calendar + Popover (install in `packages/ui`) | Consistent with existing `packages/ui` pattern; project already uses shadcn (base-lyra preset) |
| Query triggering | Debounced vs immediate on change | Immediate on change (via `useQuery` input) | Server query is fast; users expect instant feedback when picking a date; tRPC input change invalidates the query automatically |
| Default state | Today / last 7 days / empty | Empty (no filter) | Matches current behavior; opt-in filtering avoids surprise empty states |

## Data Flow

```
┌──────────────────┐   input: { dateRange }   ┌────────────────────┐
│ DateRangePicker  │ ──────────────────────── ▶ │ tRPC procedure      │
│ (app component)  │                            │ listAll / listByUserId│
└──────────────────┘                            └──────────┬──────────┘
       ▲                                                   │
       │                                                   ▼
  useState<{from,to}>                          ┌───────────────────────┐
                                               │ Service: getAll /     │
                                               │ getByUserId           │
                                               │ → and(userFilter,     │
                                               │    dateFilter)        │
                                               └──────────┬────────────┘
                                                          ▼
                                               ┌───────────────────────┐
                                               │ selectLeadWithUsers   │
                                               │ (existing WHERE plug) │
                                               └───────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/ui/src/components/calendar.tsx` | Create | shadcn Calendar primitive (install via `pnpm dlx shadcn@latest add calendar`) |
| `packages/ui/src/components/popover.tsx` | Create | shadcn Popover primitive (install similarly) |
| `packages/db/src/index.ts` | Modify | Add `gte` to the re-export list (alongside existing `lte`) |
| `packages/api/src/leads/services/get-all.ts` | Modify | Accept optional `dateRange`, build `and(...)` with gte/lte on `leads.createdAt`, pass to `selectLeadWithUsers` |
| `packages/api/src/leads/services/get-by-user.ts` | Modify | Accept optional `dateRange`, combine with existing user `or(...)` filter via `and(...)` |
| `packages/api/src/routers/leads.ts` | Modify | Add `dateRangeSchema` input (optional) to `listAll` and `listByUserId`; pass through to services |
| `apps/web/src/components/date-range-picker.tsx` | Create | App-level component: two date inputs + Calendar popover, manages internal `Date` state, calls `onChange` with ISO strings |
| `apps/web/src/app/leads/page.tsx` | Modify | Add `dateRange` state, render `DateRangePicker` above `DataTable`, pass `dateRange` into `queryOptions({ dateRange })` |

## Interfaces / Contracts

```typescript
// tRPC input schema (in routers/leads.ts)
export const dateRangeSchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .optional()
  .refine((r) => !r || !r.from || !r.to || r.from <= r.to, {
    message: "'from' must be <= 'to'",
  });

// Service-layer signature
type DateRange = { from?: string; to?: string } | undefined;

function getAll(opts?: { dateRange: DateRange }): Promise<LeadWithUsers[]>;
function getByUserId(opts: {
  userId: string;
  dateRange?: DateRange;
}): Promise<LeadWithUsers[]>;

// Component contract
interface DateRangePickerProps {
  from?: string; // ISO date
  to?: string;   // ISO date
  onChange: (range: { from?: string; to?: string }) => void;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `getAll` / `getByUserId` SQL composition | Mock `selectLeadWithUsers`, assert correct `where` SQL for: no range, from-only, to-only, both |
| Unit | `dateRangeSchema` refinement | Test from > to rejected; missing fields accepted; valid range accepted |
| Component | `DateRangePicker` state sync | Render with controlled props, simulate calendar selection, assert `onChange` payload |
| Integration | tRPC `listAll({ dateRange })` end-to-end | Seed leads with known `createdAt`, query with range, assert filtered set |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. The new input is optional, so existing clients calling `listAll()` / `listByUserId()` continue to work unchanged. Calendar and Popover are additive UI primitives.

## Open Questions

- [ ] Confirm timezone assumption: are `from`/`to` interpreted in user's local timezone or UTC? (Proposal: local, with `startOfDay`/`endOfDay` expansion in the service layer.)
- [ ] Do we want a "clear filter" affordance (a button) on the picker, or rely on clearing both fields?
