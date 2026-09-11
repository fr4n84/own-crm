# WhatsApp preparation outbox

## Current scope

The CRM can record WhatsApp-specific consent for a queue lead, create an editable manual or AI-assisted draft, submit it with an idempotency key, and require a different authorized user to approve it. Approval does **not** send a message.

The legacy queue checkbox remains a manual record of an external send. It is intentionally independent from outbox approval.

## Safety invariants

- A phone number and email-marketing consent never imply WhatsApp consent.
- Consent is bound to the lead's current normalized phone and is revalidated at submission and approval.
- Revoking consent cancels pending approvals in the same database transaction.
- The author cannot approve their own message.
- Reusing an idempotency key returns the same submission only when its content, lead, origin, and author match; conflicting reuse fails.
- Consent and outbox events are append-only audit records.
- AI drafting sends only a bounded CRM projection (source, campaign, acquisition angle, and confirmed categorical motivations/objections) with OpenAI `store: false`. It excludes phone, email, name, transcripts, free-text answers, and coaching data.
- There is no delivery route, worker, retry loop, webhook handler, or provider success simulation.

## State machine

`pending_approval -> approved`

`pending_approval -> cancelled`

`approved` and `cancelled` are terminal in this work unit. Provider delivery states must not be added until activation requirements are verified.

## Configuration

- `WHATSAPP_DELIVERY_PROVIDER`: accepts only `disabled` and defaults to `disabled`.
- `WHATSAPP_META_ACCESS_TOKEN`: optional placeholder; never used while delivery is disabled.
- `WHATSAPP_META_PHONE_NUMBER_ID`: optional placeholder; never used while delivery is disabled.
- `WHATSAPP_META_GRAPH_API_VERSION`: optional placeholder; never used while delivery is disabled.

Setting the Meta placeholders does not enable delivery.

## Activation blockers

Meta's official Cloud API documentation endpoints returned HTTP 429 during implementation. No request URL, payload, version, template/session rule, webhook signature, or status mapping has been guessed. Activation remains blocked until an engineer can verify those details from current official Meta documentation and implement them behind `WhatsappDeliveryProvider` with focused contract tests.

Activation also requires approved Meta business assets and credentials, a deliberate secrets rollout, consent/legal review, delivery-status webhooks, bounded retry/idempotency policy, monitoring, and an explicit user decision to enable delivery.

## Migration and runtime checks

Migration `0052` creates the consent, consent-event, outbox-message, and outbox-event tables. Apply it only through the normal database migration process in a controlled environment; this work unit does not touch a remote or production database.

Runtime harness boundary: authenticated UI smoke test with two authorized users. User A records consent and submits; user A must be rejected on approval; user B approves; both users must continue to see `Proveedor desactivado`, and no network request to Meta may occur.

Rollback boundary: before migration application, revert the WhatsApp schema export, API routes/service, preparation dialog, queue integration, env placeholders, migration artifacts, and this runbook. After applying `0052`, use a reviewed forward migration only after confirming the new tables contain no records; do not delete audit data casually.
