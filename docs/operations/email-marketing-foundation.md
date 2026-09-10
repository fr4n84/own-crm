# Review the Email Marketing foundation before enabling delivery

This slice creates an administrative preparation area for consent, suppression, immutable audience snapshots, and human-approved copy. It deliberately cannot send email, call a provider, track recipients, or run AI-generated copy. The database migration is generated but must be reviewed and applied through the normal deployment process.

## Review path

1. Review `packages/db/src/schema/email-marketing.ts` and migration `0047_email_marketing_foundation.sql`.
2. Review the deterministic eligibility policy in `packages/api/src/email-marketing/domain.ts`.
3. Review the admin-only API in `packages/api/src/routers/email-marketing.ts`.
4. Confirm the `/email-marketing` screen exposes no send action and is hidden from non-admin roles.
5. Run the focused tests and type checks before considering the migration.

## Consent model

An email address or lead record is never evidence of consent.

- Permission authority is stored per normalized email, optionally linked to a lead for context.
- A permission is either `granted` or `revoked`; absence means no active consent.
- Every grant or revocation records the acting administrator, source, evidence, business occurrence time, CRM recording time, and monotonically increasing version.
- Append-only permission events preserve the history even though the current permission row is updated for efficient checks.
- Evidence with an occurrence time older than the current authority decision is rejected, so stale imports cannot silently re-grant consent.
- Email normalization reuses the CRM's canonical `normalizeLeadEmail` function.

This model records operational evidence. It does **not** determine whether that evidence satisfies a particular law, jurisdiction, or legal basis.

## Suppression model

Suppression is independent from consent and always wins during audience construction.

- An active suppression excludes the normalized email even when consent is `granted`.
- Re-granting consent never removes a suppression.
- The standard UI does not expose an unsuppress action.
- The API can lift a suppression only through an explicit global-administrator operation that records actor, reason, source, evidence, timestamp, and a new version.
- Suppression events remain append-only.

This conservative default prevents accidental resubscription. A future unsubscribe endpoint must create a suppression, not merely revoke consent.

## Immutable audience snapshots

Each build creates a new snapshot with a monotonically increasing campaign version. Existing snapshots and members are never updated or deleted by the service. Migration `0047` also installs database triggers that reject ordinary `UPDATE` and `DELETE` operations on both tables.

The only supported source is `all_unmerged_leads`; no SQL, expression, or executable audience query is stored. Every evaluated lead produces a member record with:

- the frozen lead identifier, name, and normalized email available at build time;
- an `included` or `excluded` decision;
- one stable reason: eligible, missing normalized email, no active consent, suppressed, or duplicate normalized email;
- the exact permission/suppression identifiers, versions, sources, timestamps, selected duplicate owner, and policy version used for the decision.

Inputs are sorted by lead ID. For duplicate normalized emails, the lexically first lead ID is the sole eligible member and all others are explicitly excluded. This makes the snapshot deterministic and prevents duplicate delivery if a future delivery layer uses it.

## Copy approval flow

1. An administrator creates a campaign in `draft`.
2. An administrator saves a copy version in `draft`.
3. A person reviews the exact version number, subject, preview, and full body rendered by the admin UI.
4. Explicit approval records approver and approval time.
5. Any previously approved version becomes `retired`; a partial unique index permits only one approved version per campaign.
6. A campaign becomes `ready` only when its latest preparation has an approved copy and a snapshot with at least one included member.

`ready` means prepared for a future delivery decision. It never means sent. There is no send procedure in this slice.

## Stored data

The CRM stores:

- normalized email permission and suppression state;
- audit evidence and source supplied by an administrator;
- campaign names and preparation state;
- versioned plain-text email subject, preview text, and body;
- immutable audience decisions and their evidence;
- administrator identifiers and timestamps.

Do not place credentials, authentication tokens, payment data, health data, or unnecessary sensitive information in evidence or copy fields.

## Threats and current controls

### Accidental email without consent

Control: no permission row means exclusion; only `granted` is eligible; active suppression is evaluated before consent.

### Duplicate delivery

Control: one included member per normalized email in each deterministic snapshot.

### Audience drift after review

Control: new builds append a new snapshot. They do not modify the reviewed snapshot.

### Unreviewed or replaced copy

Control: draft copy is not deliverable, approval is attributed and timestamped, and only one version can remain approved.

### Privilege leakage

Control: every tRPC procedure requires wildcard global administration. The client also avoids loading queries for non-admin roles, but server authorization remains authoritative.

### Audit tampering

Control: current state has version counters and every action appends a separate event. Existing authority rows are locked before the next version is derived, preventing concurrent lost updates. Database foreign keys use restrictive deletion for actors and marketing history.

### Arbitrary query or code execution

Control: snapshots use a fixed source kind and store no query or expression.

### Premature delivery capability

Control: this slice has no provider credentials, outbox, send procedure, webhook, tracking pixel, scheduling worker, or AI integration.

## Future provider adapter boundary

The application owns one provider-neutral port: `EmailMarketingDeliveryProvider`. It accepts only a future delivery request expressed in CRM terms:

- a stable idempotency key;
- one normalized recipient and its lead identifier;
- the exact human-approved campaign content version;
- the approved sender identity;
- the unsubscribe URL plus `List-Unsubscribe` and one-click headers;
- a normalized `accepted` result with the provider message identifier.

No provider adapter is registered. `emailMarketingDeliveryCapability()` is server-owned and returns `disabled / not_configured`. `requireEmailMarketingDeliveryProvider()` throws the typed `EmailMarketingDeliveryDisabledError` before any provider method can run when the adapter is absent. The admin UI reads that server capability and displays `Delivery not configured/disabled` without an activation or send action.

Textual boundary diagram:

```text
approved campaign + immutable audience
                |
       future send-time policy
(consent + suppression + frequency)
                |
 EmailMarketingDeliveryProvider
                |
 future provider-specific adapter
                |
       external email provider
```

Only the port exists today. The future send-time policy, adapter, provider call, and operational state do not.

### Adding a future adapter

1. Implement `EmailMarketingDeliveryProvider` in a provider-specific infrastructure module.
2. Translate the domain request to the provider SDK/API without leaking provider fields into campaign or audience models.
3. Register the adapter only in server composition after configuration validation; never select it from client input.
4. Extend the server capability from disabled to a reviewed configured state. Do not infer capability from the presence of environment variables alone.
5. Build delivery separately with its own schema, outbox, authorization, tests, operational review, and migration.

A future adapter must preserve these invariants:

- use the supplied idempotency key for every attempt and reconciliation;
- accept only a content version already approved by a person;
- include the supplied unsubscribe URL and headers;
- re-check consent, active suppression, frequency, and quiet hours immediately before enqueue/send in the application layer;
- apply bounded timeouts and a caller-owned retry budget; never retry indefinitely inside the adapter;
- return only normalized identifiers/results and sanitized errors, never credentials or raw provider payloads;
- keep provider credentials server-only and redact authorization/request headers from logs;
- treat webhook processing as a separate authenticated, replay-protected, idempotent boundary;
- never let a provider callback grant consent or clear suppression.

### Provider adapter review checklist

- [ ] Missing adapter produces `EmailMarketingDeliveryDisabledError` with zero external effects.
- [ ] Capability is derived and returned by the server, not toggled by the browser.
- [ ] Provider-specific names and payloads stay outside the domain and application contract.
- [ ] Idempotency behavior is demonstrated against timeout and ambiguous-response scenarios.
- [ ] Unsubscribe URL and one-click headers are present in every deliverable message.
- [ ] Send-time consent and suppression checks use current CRM authority, not only the snapshot.
- [ ] Timeouts, retry budget, sanitized errors, metrics, and alerting are documented.
- [ ] Webhook signatures, replay windows, deduplication, and reconciliation are verified independently.
- [ ] Enabling an adapter does not itself create a send endpoint or activate a campaign.
## Decisions required before delivery

Do not implement or activate delivery until the business has explicitly decided and reviewed:

- applicable legal basis, jurisdictions, proof requirements, retention, data-subject handling, and an audited exceptional process for legally required snapshot erasure;
- sending provider, verified domain, SPF, DKIM, DMARC, bounce handling, and credential rotation;
- signed unsubscribe links, one-click unsubscribe behavior, replay protection, and idempotency;
- webhook authenticity, replay protection, event deduplication, and failure recovery;
- frequency caps, quiet hours, campaign priority, and the authoritative time zone;
- whether opens/clicks are tracked at all, including privacy implications and reporting limits;
- AI copy policy, approved inputs, redaction, `store:false`, review responsibilities, and prohibited autonomous publication;
- outbox state machine, idempotency keys, retry budget, dead-letter handling, and reconciliation.

## Current limits

- No emails can be sent.
- No provider adapter, credentials, server registration, or DNS configuration exists.
- No unsubscribe endpoint exists yet.
- No frequency or quiet-hour policy exists yet.
- No open/click tracking exists.
- No AI copy generation exists.
- The UI provides preparation and approval visibility, not a legal compliance determination.
- Migration `0047_email_marketing_foundation.sql` is generated and intentionally not applied.

## Verification checklist

- [ ] No consent is inferred from the presence of an email.
- [ ] Active suppression wins over granted consent.
- [ ] Snapshot output is deterministic and append-only in service behavior.
- [ ] Only wildcard administrators can access API procedures and navigation.
- [ ] Draft copy cannot satisfy the delivery guard.
- [ ] Migration constraints match the schema and contain no delivery tables.
- [ ] The UI contains no send action and renders the exact copy payload before approval.
- [ ] Example configuration contains no provider selection or provider credential variables.



