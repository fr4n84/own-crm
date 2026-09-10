import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export type CommandInput = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

export type CommandRunner = (input: CommandInput) => Promise<void>;

export type BackupManifest = {
  version: 1;
  format: "postgres-custom";
  databaseName: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
};

export function parsePostgresConnection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !databaseName) throw new Error("DATABASE_URL is incomplete");
  const sslMode = url.searchParams.get("sslmode");
  return {
    databaseName,
    args: [databaseName],
    env: {
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      ...(sslMode ? { PGSSLMODE: sslMode } : {}),
    } satisfies NodeJS.ProcessEnv,
    identity: `${url.hostname.toLowerCase()}:${url.port || "5432"}/${databaseName}`,
  };
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function timestampForFile(now: Date) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function assertManifest(value: unknown): asserts value is BackupManifest {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as BackupManifest).version !== 1 ||
    (value as BackupManifest).format !== "postgres-custom" ||
    typeof (value as BackupManifest).databaseName !== "string" ||
    typeof (value as BackupManifest).createdAt !== "string" ||
    !Number.isSafeInteger((value as BackupManifest).sizeBytes) ||
    !/^[a-f0-9]{64}$/.test((value as BackupManifest).sha256)
  ) {
    throw new Error("Invalid backup manifest");
  }
}

export async function backupPostgres(input: {
  databaseUrl: string;
  directory: string;
  now?: Date;
  run: CommandRunner;
}) {
  const connection = parsePostgresConnection(input.databaseUrl);
  const directory = resolve(input.directory);
  const now = input.now ?? new Date();
  const prefix = `${connection.databaseName}-${timestampForFile(now)}`;
  const backupPath = join(directory, `${prefix}.dump`);
  const manifestPath = join(directory, `${prefix}.manifest.json`);
  const temporaryBackupPath = `${backupPath}.partial`;
  const temporaryManifestPath = `${manifestPath}.partial`;
  await mkdir(directory, { recursive: true });
  try {
    await input.run({
      command: "pg_dump",
      args: [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        `--file=${temporaryBackupPath}`,
        ...connection.args,
      ],
      env: { ...process.env, ...connection.env },
    });
    const backupStat = await stat(temporaryBackupPath);
    if (backupStat.size <= 0) throw new Error("pg_dump produced an empty backup");
    const manifest: BackupManifest = {
      version: 1,
      format: "postgres-custom",
      databaseName: connection.databaseName,
      createdAt: now.toISOString(),
      sizeBytes: backupStat.size,
      sha256: await sha256(temporaryBackupPath),
    };
    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporaryBackupPath, backupPath);
    await rename(temporaryManifestPath, manifestPath);
    return { backupPath, manifestPath, manifest };
  } catch (error) {
    await Promise.all([
      rm(temporaryBackupPath, { force: true }),
      rm(temporaryManifestPath, { force: true }),
    ]);
    throw error;
  }
}

export async function verifyBackup(input: {
  backupPath: string;
  manifestPath: string;
  run: CommandRunner;
}) {
  const manifestValue: unknown = JSON.parse(await readFile(input.manifestPath, "utf8"));
  assertManifest(manifestValue);
  const backupPath = resolve(input.backupPath);
  const backupStat = await stat(backupPath);
  if (backupStat.size !== manifestValue.sizeBytes) throw new Error("Backup size mismatch");
  if ((await sha256(backupPath)) !== manifestValue.sha256) {
    throw new Error("Backup checksum mismatch");
  }
  await input.run({ command: "pg_restore", args: ["--list", backupPath] });
  return manifestValue;
}

export function verifyRestoreTarget(sourceUrl: string, targetUrl: string) {
  const source = parsePostgresConnection(sourceUrl);
  const target = parsePostgresConnection(targetUrl);
  if (source.identity === target.identity) {
    throw new Error("Restore verification requires a different database");
  }
  if (!target.databaseName.endsWith("_restore_verify")) {
    throw new Error("Restore verification database name must end with _restore_verify");
  }
  return target;
}

const EMPTY_TARGET_CHECK = `DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ) THEN
    RAISE EXCEPTION 'verification target is not empty';
  END IF;
END
$verify$;`;

const RESTORE_CONTENT_CHECK = `DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ) THEN
    RAISE EXCEPTION 'restored database has no application tables';
  END IF;
END
$verify$;`;

export async function restorePostgresForVerification(input: {
  sourceUrl: string;
  targetUrl: string;
  backupPath: string;
  manifestPath: string;
  confirmedDisposableTarget?: boolean;
  run: CommandRunner;
}) {
  if (!input.confirmedDisposableTarget) {
    throw new Error("Disposable restore target confirmation is required");
  }
  const target = verifyRestoreTarget(input.sourceUrl, input.targetUrl);
  const source = parsePostgresConnection(input.sourceUrl);
  const manifest = await verifyBackup({
    backupPath: input.backupPath,
    manifestPath: input.manifestPath,
    run: input.run,
  });
  if (manifest.databaseName !== source.databaseName) {
    throw new Error("Backup manifest does not match the source database");
  }
  const env = { ...process.env, ...target.env };
  await input.run({
    command: "psql",
    args: ["--set=ON_ERROR_STOP=1", "--command", EMPTY_TARGET_CHECK, ...target.args],
    env,
  });
  await input.run({
    command: "pg_restore",
    args: [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      `--dbname=${target.databaseName}`,
      resolve(input.backupPath),
    ],
    env,
  });
  await input.run({
    command: "psql",
    args: ["--set=ON_ERROR_STOP=1", "--command", RESTORE_CONTENT_CHECK, ...target.args],
    env,
  });
  return manifest;
}

export function backupName(path: string) {
  return basename(path);
}
