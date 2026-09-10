import { backupName, verifyBackup } from "../src/operations/postgres-backup";
import { runPostgresCommand } from "./postgres-command";

const backupPath = process.env.BACKUP_FILE;
const manifestPath = process.env.BACKUP_MANIFEST;
if (!backupPath) throw new Error("BACKUP_FILE is required");
if (!manifestPath) throw new Error("BACKUP_MANIFEST is required");

const manifest = await verifyBackup({ backupPath, manifestPath, run: runPostgresCommand });
console.log(JSON.stringify({
  status: "verified",
  backup: backupName(backupPath),
  sizeBytes: manifest.sizeBytes,
  sha256: manifest.sha256,
}));
