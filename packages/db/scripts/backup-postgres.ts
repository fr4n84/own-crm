import { backupName, backupPostgres } from "../src/operations/postgres-backup";
import { runPostgresCommand } from "./postgres-command";

const databaseUrl = process.env.DATABASE_URL;
const directory = process.env.BACKUP_DIRECTORY;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!directory) throw new Error("BACKUP_DIRECTORY is required");

const result = await backupPostgres({ databaseUrl, directory, run: runPostgresCommand });
console.log(JSON.stringify({
  status: "created",
  backup: backupName(result.backupPath),
  manifest: backupName(result.manifestPath),
  sizeBytes: result.manifest.sizeBytes,
  sha256: result.manifest.sha256,
}));
