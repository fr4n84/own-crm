# Google Meet recording sync operations

## Purpose and policy

The CRM discovers completed Google Meet recordings, moves them into one configured private Shared Drive, and persists provider metadata only. Recordings are retained indefinitely and are never deleted automatically by this application.

Two server-owned entry points reuse the same recording-sync runtime:

- `closerMeet.runRecordingSync`: authenticated tRPC mutation restricted to wildcard administrators for manual operation.
- `POST /api/internal/closer-meet/recording-sync`: machine-to-machine endpoint for deployment scheduling.

Neither entry point accepts Meet, Drive, lead, session, or file identifiers. Work is selected only from trusted database state and server configuration.

## Architecture and request flow

1. The scheduler sends an HTTPS `POST` request with an exact `Authorization: Bearer <secret>` header.
2. The Route Handler checks that `CLOSER_MEET_SYNC_SECRET` is configured and authenticates the bearer credential before constructing the Google client or reading/writing the database.
3. Credentials are compared in constant time after SHA-256 normalization, so different input lengths do not create an unsafe direct comparison.
4. The shared runtime discovers eligible sessions from the database, resolves Meet conference records, finds `FILE_GENERATED` recordings, moves them into `GOOGLE_WORKSPACE_SHARED_DRIVE_ID`, and atomically persists identifiers, URLs, timestamps, and status.
5. The endpoint returns aggregate counts only. Provider payloads, record IDs, errors, credentials, and personal data are never returned.

The handler uses the Node.js runtime because authentication relies on 
ode:crypto`. Only `POST` is implemented; other methods are not operational entry points.

## HTTP contract

Request:

- Method: `POST`
- Path: `/api/internal/closer-meet/recording-sync`
- Header: `Authorization: Bearer <CLOSER_MEET_SYNC_SECRET>`
- Optional header: `X-Request-Id` using 8–128 safe identifier characters
- Query parameters: none
- Request body: none

Responses always include `Cache-Control: no-store`:

- `200`: `{ "synced": number, "failed": number }`
- `401`: `{ "error": "Unauthorized" }`
- `503`: `{ "error": "Service unavailable" }` when machine or Workspace configuration is unavailable
- `500`: `{ "error": "Recording sync failed" }`

These envelopes intentionally do not explain which credential, provider call, database row, or configuration item failed.

## Assets and threats

Protected assets:

- Meet recording and conference identifiers.
- Private Shared Drive contents and URLs.
- CRM lead/session metadata.
- Service-account credentials, delegated identity, and the dedicated scheduler secret.

Primary threats:

- Unauthorized invocation through a leaked or guessed bearer secret.
- Secret disclosure through URLs, request bodies, logs, source control, screenshots, tickets, or shell history.
- Replay or concurrent scheduler runs causing duplicate provider requests.
- Broad Drive scope being abused through an over-privileged delegated account.
- Provider error payloads leaking operational or personal data.

## Security controls

- A dedicated `CLOSER_MEET_SYNC_SECRET` is required by this route and validated as at least 32 characters.
- The secret is never reused from Better Auth, Google credentials, cookies, or database credentials.
- Authorization occurs before runtime composition, Google client creation, or database access.
- Bearer syntax is exact and credentials are never accepted in URL, query, body, or alternate headers.
- Constant-time digest comparison handles same- and different-length inputs safely.
- Invalid or malformed credentials return one generic `401` response with zero side effects.
- Responses are non-cacheable and contain only aggregate counts or generic errors.
- Server error reporting records a safe request ID and operation name, not request authorization, provider payloads, recording identifiers, or exception messages.
- Database status transitions are conditional, and moving an already moved file returns its existing metadata without another move.
- The Shared Drive ID and all provider identifiers come exclusively from server configuration and trusted database records.

## Secret generation and storage

Prefer the deployment platform's cryptographically secure secret generator and secret store. Generate at least 32 random bytes; 48 random bytes encoded as Base64 is a suitable default. A provider-neutral command in a trusted terminal is:

```text
openssl rand -base64 48
```

Transfer the result directly into the deployment secret store as `CLOSER_MEET_SYNC_SECRET`. Do not paste it into chat, tickets, documentation, source files, `.env.example`, command arguments, or monitoring labels. The repository contains only an empty placeholder in `apps/web/.env.example`; the real `apps/web/.env` must not be modified or committed.

Configure the scheduler's authorization header from its own secret reference, not as literal configuration text. Require HTTPS and ensure infrastructure access logs redact the `Authorization` header.

## Scheduler configuration

Start with one run every 15 minutes. Configure the scheduler to:

- send only `POST` over HTTPS;
- set the bearer header from the secret store;
- send no body and no query parameters;
- use a timeout long enough for the bounded batch but shorter than the scheduling interval;
- avoid overlapping executions when the scheduler supports that option;
- retry only transient `500`/`503` responses with bounded exponential backoff and jitter;
- never retry `401` until credentials are corrected;
- alert on repeated non-`200` responses or sustained nonzero `failed` counts.

The application does not assume a particular scheduler or hosting provider.

## Rotation and incident response

The runtime accepts one active scheduler secret. Rotate without exposing it:

1. Pause scheduled invocations.
2. Generate a new secret directly into the approved secret store.
3. Update the application and scheduler secret references without printing their values.
4. Redeploy/restart the application so the new environment is active.
5. Perform one authorized health invocation and verify only the aggregate response.
6. Resume scheduling and revoke/delete the old secret version.

If exposure is suspected, pause the scheduler, revoke the secret immediately, inspect sanitized access logs for unexpected request IDs/times/statuses, rotate the secret, and review Shared Drive and CRM audit activity. Do not include the compromised value in the incident record.

## Google Workspace permissions

Domain-wide delegation authorizes `https://www.googleapis.com/auth/drive` because Meet creates the recording files and the narrower `drive.file` scope cannot normally move them. Compensate for this broad API scope operationally:

- dedicate the delegated Workspace user to this integration;
- grant it only the Workspace roles necessary to organize these meetings;
- restrict its Drive membership to the designated private Shared Drive wherever operationally possible;
- do not use the identity for personal mail, documents, or unrelated automation;
- periodically review domain-wide delegation, Shared Drive membership, service-account keys, and access logs;
- remove unused credentials immediately.

The service account also needs only the Calendar and Meet scopes already declared by the integration. The Shared Drive must not be publicly shared.

## Audit and monitoring

Record only request timestamp, safe request ID, HTTP status, duration, aggregate `synced`/`failed` counts, and a generic operation/error code. Never record bearer headers, environment values, cookies, request bodies, Google payloads, recording URLs/names, lead/user IDs, email addresses, or transcript/media contents.

Monitor for repeated `401`, bursts of invocations, overlapping execution windows, sustained `500`/`503`, and repeated nonzero `failed` counts. Provider and database diagnostics must remain in access-controlled systems and follow the same redaction rules.

## Limits and residual risk

There is no database-backed distributed lease. Conditional database transitions and idempotent move detection make state converge safely, but two simultaneous runs can still duplicate read/provider requests and one may report a transient failure after the other succeeds. Infrastructure SHOULD prevent overlap. Add a database advisory lock only if production evidence shows overlap is material; holding a normal transaction across Google calls would be unsafe.

A bearer secret authenticates the caller but does not provide per-request freshness, source attestation, or replay prevention. HTTPS, secret protection, scheduler access controls, non-overlap, monitoring, and bounded retries remain deployment responsibilities.

No live Google Workspace or database verification was performed during implementation.

## Review checklist

- [ ] `CLOSER_MEET_SYNC_SECRET` contains at least 32 random characters and is stored only in approved secret stores.
- [ ] The scheduler sends only HTTPS `POST` with the secret in `Authorization`.
- [ ] Authorization headers are redacted from all infrastructure logs.
- [ ] Missing, malformed, short/long incorrect, and valid credentials behave as tested.
- [ ] Runtime/Google/DB construction cannot occur before successful authentication.
- [ ] Responses use `Cache-Control: no-store` and contain no internal identifiers or provider details.
- [ ] The delegated Workspace account is dedicated and operationally restricted.
- [ ] Full Drive domain-wide delegation and Shared Drive membership are reviewed periodically.
- [ ] Scheduler overlap is disabled where supported; retries are bounded.
- [ ] Alerts exist for authentication failures, server failures, and persistent sync failures.
- [ ] `apps/web/.env` and real secret values remain uncommitted.

## Verification evidence

The focused Route Handler suite covers absent configuration, missing/malformed/incorrect bearer values, different credential lengths, valid execution, no runtime effects before authentication, unavailable Workspace runtime, no-store responses, aggregate-only success, and sanitized errors. The existing recording-sync suite covers conditional persistence and idempotent provider movement. Typechecks for web, API, and environment configuration must pass before delivery.

## Transcript encryption and AI boundary

`CLOSER_MEET_TRANSCRIPT_KEY` is a dedicated AES-256-GCM key encoded as canonical Base64 of exactly 32 random bytes. `CLOSER_MEET_TRANSCRIPT_KEY_ID` is a non-secret version identifier stored with each ciphertext for future key rotation. Every encryption uses a fresh 96-bit nonce and versioned canonical associated data (AAD) binding the ciphertext to the exact `closerMeetSessionId` and `transcriptResourceName`. Moving a nonce/ciphertext/tag package to another session or resource therefore fails GCM authentication. The AAD is derived from existing non-secret row metadata and is not stored separately. The envelope stores ciphertext, authentication tag, algorithm version, key ID, provider resource name, language when unambiguous, SHA-256 fingerprint, character count, sync/error timestamps, and a generic error code. Plaintext exists only in authorized server-process memory and is never written to logs, database fields, scheduler responses, or unauthorized API responses.

Generate the key directly into the approved secret manager (for example, `openssl rand -base64 32`) and assign a stable identifier such as `meet-2026-01`. Never paste the key into source control, chat, tickets, shell arguments, backups documentation, or analytics. Backups contain encrypted transcripts and must be access-controlled like production data.

A provider resource-name change requires fetching the new transcript and atomically encrypting it again with the new AAD; the previous ciphertext cannot be relabeled. This intentionally couples integrity to provider identity and prevents row substitution; manual resource-name corrections must re-encrypt plaintext through the reviewed server operation rather than editing metadata directly.

Rotation is not automatic: deploy code/config able to decrypt the old key ID, re-encrypt rows in a reviewed bounded operation, verify counts/authentication, then retire the old key. DO NOT replace or destroy the old key before re-encryption completes. Loss of every copy of a referenced key makes those transcripts unrecoverable; this is an intentional cryptographic consequence, not a repairable database failure.

Authorized Closers may read/analyze only sessions assigned to them; wildcard administrators are the only cross-user exception. The broader `coaching:read` permission does not grant transcript access. Every request revalidates database ownership; client-provided Drive/Meet IDs are never trusted. The default panel exposes only availability metadata. Plaintext is fetched only after **Ver transcripción**, rendered only in that deliberate detail, and immediately removed from the TanStack Query cache.

Joint analysis runs only after **Generar coaching con IA**, selects at most five latest transcripts server-side, rejects more than 100,000 plaintext characters, and fails closed if those transcripts belong to different Closers. OpenAI receives authorized plaintext transiently through the Responses API with `store:false` and the existing commercial-coaching structured schema. Only the structured draft is stored in `commercial_coaching_analyses`; transcript text and the draft body are not returned by the Meet mutation. The Closer or Admin must review the draft in **Estadísticas personales → Coaching con IA** and explicitly confirm or discard it. `store:false` limits OpenAI application storage but is not a promise of legal compliance or zero provider-side processing risk. Video/audio are never sent to OpenAI by this flow.

## Transcript lifecycle, consent, and manual rights

There is no automatic transcript or video expiry. Before recording, operators must provide an appropriate notice that the call is recorded/transcribed and that access is restricted; product configuration does not itself establish legal consent. Document the lawful basis and notice process with counsel for each operating region.

Access, correction, export, and deletion requests require a reviewed manual operation covering BOTH CRM ciphertext/metadata/backups and the corresponding Shared Drive artifact. Deleting only one copy is incomplete. Define backup retention and restoration procedures so deleted or restricted data is not silently reintroduced.

Monitor only aggregate sync/analysis counts, duration, generic error codes, authentication failures, and key IDs. Never log transcript text, ciphertext, nonces/tags, hashes, prompts, model outputs, provider payloads, lead/user IDs, emails, URLs, or secrets. On suspected key disclosure: disable transcript sync/read/analysis, revoke access, rotate and re-encrypt under incident control, inspect sanitized audit events, and assess notification obligations without copying sensitive data into the incident ticket.

Residual risks include application-host compromise exposing plaintext in memory, privileged database plus key-store compromise enabling decryption, incorrect consent/notice, Shared Drive over-sharing, old-key loss, backup reintroduction, provider processing despite `store:false`, and concurrent sync calls duplicating reads/encryption attempts. Conditional fingerprints make writes converge, but infrastructure should still prevent overlapping schedules.

Transcript review checklist:

- [ ] Key is exactly 32 random bytes, canonical Base64, stored separately from DB backups; key ID is configured.
- [ ] Old keys remain recoverable until every ciphertext is re-encrypted and verified.
- [ ] Delegated user and Shared Drive membership use minimum operational permissions; full Drive scope is reviewed regularly.
- [ ] Closer ownership and `coaching:read` access are reviewed; default UI never renders plaintext.
- [ ] Scheduler overlap prevention, bounded pagination (10 pages/1,000 entries/200,000 characters), and alerts are configured.
- [ ] OpenAI requests use `store:false`, five-transcript/100,000-character limits, structured output, explicit uncertainty, and human review.
- [ ] Consent/notice and manual access/deletion processes are documented; no claim of automatic legal compliance is made.
## User-visible transcript and coaching prerequisites

The stored history remains readable when live Google Workspace configuration is absent, but each mutating/runtime action fails closed:

- Scheduling and recording synchronization require the Google Workspace service account, delegated user, Calendar ID, and private Shared Drive ID.
- Transcript read and analysis require `CLOSER_MEET_TRANSCRIPT_KEY` and `CLOSER_MEET_TRANSCRIPT_KEY_ID`.
- AI coaching requires `OPENAI_API_KEY`; no analysis runs automatically or during listing.
- Migrations `0045_commercial_coaching.sql` and `0046_encrypted_meet_transcripts.sql` must be applied, including the seeded `closer-v1` rubric.

If any prerequisite is absent, keep the feature disabled, surface the server precondition message, and do not substitute another provider, plaintext storage, or client-side analysis.
