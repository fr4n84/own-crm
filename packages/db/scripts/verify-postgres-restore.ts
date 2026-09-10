import { backupName, restorePostgresForVerification } from "../src/operations/postgres-backup";
import { runPostgresCommand } from "./postgres-command";

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.RESTORE_VERIFY_DATABASE_URL;
const backupPath = process.env.BACKUP_FILE;
const manifestPath = process.env.BACKUP_MANIFEST;
if (!sourceUrl) throw new Error("DATABASE_URL is required");
if (!targetUrl) throw new Error("RESTORE_VERIFY_DATABASE_URL is required");
if (!backupPath) throw new Error("BACKUP_FILE is required");
if (!manifestPath) throw new Error("BACKUP_MANIFEST is required");
if (process.env.RESTORE_VERIFY_CONFIRM !== "isolated-disposable-database") {
  throw new Error("Set RESTORE_VERIFY_CONFIRM=isolated-disposable-database");
}

const manifest = await restorePostgresForVerification({
  sourceUrl,
  targetUrl,
  backupPath,
  manifestPath,
  confirmedDisposableTarget: true,
  run: runPostgresCommand,
});
console.log(JSON.stringify({
  status: "restore-verified",
  backup: backupName(backupPath),
  sizeBytes: manifest.sizeBytes,
}));
