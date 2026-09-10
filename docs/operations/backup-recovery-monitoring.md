# Backup, recovery, and basic monitoring

This runbook covers the two persistence surfaces currently used by the CRM:

1. PostgreSQL data (the configured provider is Neon).
2. Uploaded contracts and marketing assets in the application's local `.data` directory.

A database snapshot does **not** include `.data`. Both backups must be stored outside the application host and retained independently.

## 1. Monitoring contract

- `GET /api/health` is a liveness probe. It does not access PostgreSQL.
- `GET /api/ready` runs a bounded `select 1`; it returns `503` when PostgreSQL is unavailable.
- Both responses are non-cacheable, contain no version, host, exception, or credential details, and return an `x-request-id` correlation header.
- Unexpected tRPC server errors are emitted as single-line JSON with `event=server_error`, request ID, operation, error class/code, and a redacted context. Expected validation and authorization failures are not error-monitoring events.

Configure the hosting platform to poll `/api/health` and `/api/ready`. Alert on repeated readiness failures and on `server_error` volume. The repository does not prove which hosting platform receives stdout, so log retention and alert delivery remain an external configuration task.

## 2. PostgreSQL logical backup

Prerequisites: compatible `pg_dump`, `pg_restore`, and `psql` binaries. Supply variables through the process environment; never paste a database URL into a command argument or shell history.

Required environment:

- `DATABASE_URL`: source database connection.
- `BACKUP_DIRECTORY`: durable destination mounted outside the repository and application filesystem.

Run `pnpm --filter @crm-fran/db db:backup`. The command writes a PostgreSQL custom-format dump atomically and a JSON manifest containing size and SHA-256, but no connection credentials.

Set `BACKUP_FILE` and `BACKUP_MANIFEST`, then run `pnpm --filter @crm-fran/db db:backup:verify`. This checks size, SHA-256, and `pg_restore --list`. A successful list check proves structural readability, not recoverability.

## 3. Isolated PostgreSQL restore drill

Create a new, empty, disposable database whose name ends with `_restore_verify`. It must not be the source database. Then set:

- `RESTORE_VERIFY_DATABASE_URL`: disposable target connection.
- `BACKUP_FILE` and `BACKUP_MANIFEST`.
- `RESTORE_VERIFY_CONFIRM=isolated-disposable-database`.

Run `pnpm --filter @crm-fran/db db:restore:verify`. The tool:

1. verifies the dump and manifest;
2. rejects the source database and non-verification database names;
3. rejects a target containing application tables;
4. restores with `--exit-on-error`; and
5. verifies that application tables exist afterward.

It deliberately does not create or delete databases. Dispose of the verification database through the provider only after reviewing the result.

## 4. Local file backup and restore drill

Set `LOCAL_DATA_DIRECTORY` to the runtime directory that contains `closer-contracts` and `marketing-assets`, and set `FILE_BACKUP_DIRECTORY` to durable storage outside it. Run `pnpm files:backup`.

Set `FILE_BACKUP_SNAPSHOT` to the generated snapshot and run `pnpm files:backup:verify`. Every file is checked against the manifest inventory, size, and SHA-256.

For a restore drill, choose an empty disposable directory whose name ends with `_restore_verify`, set `FILE_RESTORE_VERIFY_DIRECTORY`, set `RESTORE_VERIFY_CONFIRM=isolated-disposable-directory`, and run `pnpm files:restore:verify`. The tool copies and re-verifies every file and never deletes the target.

Local application storage can be ephemeral on serverless hosting. Until durable object storage is configured, run this file backup from the host that actually owns `.data`; an empty directory is not proof that no uploads exist.

## 5. Operating schedule and evidence

- Run logical database and local-file backups on a scheduler outside the web process.
- Verify every generated backup immediately.
- Run an isolated restore drill at least monthly and after PostgreSQL major-version changes.
- Retain the command result, manifest, backup location, drill date, operator, and recovery duration. Do not retain connection URLs or logs containing user data.
- Define the required recovery point objective (RPO), recovery time objective (RTO), retention duration, encryption/key owner, and alert recipient before production automation.

Neon's managed snapshots or point-in-time recovery should be enabled and tested as an additional layer, not a substitute for an independently stored logical backup. Enabling provider retention, external storage, schedules, and notifications changes external systems and requires explicit authorization.
