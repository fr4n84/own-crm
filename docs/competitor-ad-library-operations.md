# Competitor Ad Library ingestion operations

## Current safety posture

The ingestion foundation is **disabled by default**. It does not send requests to Meta unless every activation requirement below is satisfied. This work unit adds no scheduler. The read-only intelligence dashboard lives at Observatorio comercial > Biblioteca publicitaria > Competencia (/observatorio-comercial/biblioteca-publicitaria).

The service persists only allowlisted public ad fields: Meta library ad ID, Page ID/name, delivery dates, publisher platforms, public creative text, snapshot URL, and the documented reach/impressions/spend representations. Provider payload fields outside that allowlist are discarded.

Metrics retain their source semantics:

- EU total reach is stored as `estimated`.
- Impression and spend bounds are stored as `range`; they are never converted into exact values.
- Missing metrics are stored as `unavailable`, never zero.
- `ai_inferred` is reserved as a distinct future classification. This work unit does not produce AI inference.


## Observatory interface

Authorized Observatory users can read the latest competitor observations and the sanitized daily synchronization history. Only Admin can add or edit a competitor Page ID, display name, country list, or enabled state. Provider tokens, the sync secret, raw provider errors, and provider payloads are never returned to this view.

The interface labels reach as estimated, impressions/spend as ranges, and missing values as unavailable. It does not sum incomparable metrics or generate AI inferences. There is deliberately no manual synchronization action: daily execution remains scheduler-driven through the internal authenticated endpoint.
## Activation blockers

Do not enable the runtime until all of these are complete:

1. Apply and verify migration `0053_competitor_ad_library.sql` in the intended PostgreSQL environment.
2. Create an approved Meta developer app and obtain a token with the required Ad Library access.
3. Select and explicitly configure a supported Graph API version. The application does not guess or default an API version.
4. Configure a strong machine-to-machine sync secret.
5. Add at least one enabled competitor Page ID through the Admin-only tRPC procedures.
6. Configure an external scheduler only after the authenticated endpoint has passed a real non-production smoke test.

Required runtime settings:

- `COMPETITOR_AD_LIBRARY_PROVIDER=meta`
- `COMPETITOR_AD_META_ACCESS_TOKEN`
- `COMPETITOR_AD_META_GRAPH_API_VERSION`, for example a version explicitly selected by the operator
- `COMPETITOR_AD_SYNC_SECRET`, at least 32 characters

Optional bounded controls:

- `COMPETITOR_AD_REQUEST_TIMEOUT_MS` (100-60000, default 10000)
- `COMPETITOR_AD_MAX_PAGES` (1-50, default 10)

Tokens are sent in the Authorization header. They are not stored in the database, returned by the API, logged by this module, or added to provenance URLs.

## Deterministic daily entry point

An external scheduler can call:

`POST /api/internal/competitor-ads/daily-sync`

with `Authorization: Bearer <COMPETITOR_AD_SYNC_SECRET>`.

The daily operation key is `meta_ad_library:YYYY-MM-DD` in UTC. Repeating the call for the same day returns the already persisted immutable audit result. The response contains aggregate counts only.

Pagination follows only the validated opaque `paging.cursors.after` value. The implementation ignores `paging.next`. If the configured page bound is reached, coverage is marked incomplete and missing ads are **not** marked inactive.

## Migration and rollback boundary

Migration `0053` is generated but intentionally not applied by this work unit.

Rollback before activation: revert the schema, migration, API module, router registration, internal route, and environment declarations together. After activation, preserve or export the append-only snapshots and sync-run audit data before dropping tables. The dashboard can be rolled back independently by reverting its page, view, panel, read-only overview query, and documentation. This does not alter ingestion or persisted snapshots.
