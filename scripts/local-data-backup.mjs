import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_NAME = "manifest.json";

async function checksum(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function inventory(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(current, entry.name);
    const details = await lstat(path);
    if (details.isSymbolicLink()) throw new Error("Symbolic links are not allowed in local data backups");
    if (details.isDirectory()) files.push(...(await inventory(root, path)));
    else if (details.isFile()) {
      files.push({
        path: relative(root, path).split(sep).join("/"),
        sizeBytes: details.size,
        sha256: await checksum(path),
      });
    } else throw new Error("Unsupported local data entry");
  }
  return files;
}

async function copyInventory(source, target, files) {
  for (const file of files) {
    const sourcePath = join(source, ...file.path.split("/"));
    const targetPath = join(target, ...file.path.split("/"));
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

function timestampForFile(now) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function assertManifest(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.version !== 1 ||
    value.format !== "crm-local-files" ||
    !Array.isArray(value.files)
  ) throw new Error("Invalid local data backup manifest");
}

async function verifyDirectory(directory, manifest) {
  const actual = await inventory(directory);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) {
    throw new Error("Local data backup checksum or inventory mismatch");
  }
  return { fileCount: actual.length, sizeBytes: actual.reduce((sum, file) => sum + file.sizeBytes, 0) };
}

export async function backupLocalData({ sourceDirectory, backupDirectory, now = new Date() }) {
  const source = resolve(sourceDirectory);
  const destinationRoot = resolve(backupDirectory);
  const sourceDetails = await stat(source);
  if (!sourceDetails.isDirectory()) throw new Error("LOCAL_DATA_DIRECTORY must be a directory");
  if (destinationRoot === source || destinationRoot.startsWith(`${source}${sep}`)) {
    throw new Error("Backup directory must be outside the local data directory");
  }
  const name = `local-data-${timestampForFile(now)}`;
  const snapshot = join(destinationRoot, name);
  const temporary = `${snapshot}.partial`;
  const filesDirectory = join(temporary, "files");
  await mkdir(filesDirectory, { recursive: true });
  try {
    const files = await inventory(source);
    await copyInventory(source, filesDirectory, files);
    const manifest = {
      version: 1,
      format: "crm-local-files",
      createdAt: now.toISOString(),
      files,
    };
    await writeFile(join(temporary, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, snapshot);
    return snapshot;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyLocalDataBackup(snapshotDirectory) {
  const snapshot = resolve(snapshotDirectory);
  const manifest = JSON.parse(await readFile(join(snapshot, MANIFEST_NAME), "utf8"));
  assertManifest(manifest);
  return verifyDirectory(join(snapshot, "files"), manifest);
}

export async function restoreLocalDataForVerification({
  snapshotDirectory,
  targetDirectory,
  confirmedDisposableTarget = false,
}) {
  if (!confirmedDisposableTarget) throw new Error("Disposable restore target confirmation is required");
  const target = resolve(targetDirectory);
  if (!basename(target).endsWith("_restore_verify")) {
    throw new Error("Restore verification directory name must end with _restore_verify");
  }
  try {
    if ((await readdir(target)).length > 0) throw new Error("Restore verification target is not empty");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const snapshot = resolve(snapshotDirectory);
  const manifest = JSON.parse(await readFile(join(snapshot, MANIFEST_NAME), "utf8"));
  assertManifest(manifest);
  await mkdir(target, { recursive: true });
  await copyInventory(join(snapshot, "files"), target, manifest.files);
  return verifyDirectory(target, manifest);
}

async function main() {
  const command = process.argv[2];
  if (command === "backup") {
    if (!process.env.LOCAL_DATA_DIRECTORY) throw new Error("LOCAL_DATA_DIRECTORY is required");
    if (!process.env.FILE_BACKUP_DIRECTORY) throw new Error("FILE_BACKUP_DIRECTORY is required");
    const snapshot = await backupLocalData({
      sourceDirectory: process.env.LOCAL_DATA_DIRECTORY,
      backupDirectory: process.env.FILE_BACKUP_DIRECTORY,
    });
    console.log(JSON.stringify({ status: "created", snapshot: basename(snapshot) }));
    return;
  }
  if (command === "verify") {
    if (!process.env.FILE_BACKUP_SNAPSHOT) throw new Error("FILE_BACKUP_SNAPSHOT is required");
    const result = await verifyLocalDataBackup(process.env.FILE_BACKUP_SNAPSHOT);
    console.log(JSON.stringify({ status: "verified", ...result }));
    return;
  }
  if (command === "restore-verify") {
    if (!process.env.FILE_BACKUP_SNAPSHOT) throw new Error("FILE_BACKUP_SNAPSHOT is required");
    if (!process.env.FILE_RESTORE_VERIFY_DIRECTORY) throw new Error("FILE_RESTORE_VERIFY_DIRECTORY is required");
    if (process.env.RESTORE_VERIFY_CONFIRM !== "isolated-disposable-directory") {
      throw new Error("Set RESTORE_VERIFY_CONFIRM=isolated-disposable-directory");
    }
    const result = await restoreLocalDataForVerification({
      snapshotDirectory: process.env.FILE_BACKUP_SNAPSHOT,
      targetDirectory: process.env.FILE_RESTORE_VERIFY_DIRECTORY,
      confirmedDisposableTarget: true,
    });
    console.log(JSON.stringify({ status: "restore-verified", ...result }));
    return;
  }
  throw new Error("Use backup, verify, or restore-verify");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
