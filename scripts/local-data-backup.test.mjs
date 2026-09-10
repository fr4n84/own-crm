import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  backupLocalData,
  restoreLocalDataForVerification,
  verifyLocalDataBackup,
} from "./local-data-backup.mjs";

describe("local file backup", () => {
  it("copies both storage areas with hashes and verifies an isolated restore", async () => {
    const root = await mkdtemp(join(tmpdir(), "crm-local-backup-"));
    const source = join(root, "source");
    const destination = join(root, "backups");
    const restoreTarget = join(root, "files_restore_verify");
    await mkdir(join(source, "closer-contracts"), { recursive: true });
    await mkdir(join(source, "marketing-assets"), { recursive: true });
    await writeFile(join(source, "closer-contracts", "contract.pdf"), "contract");
    await writeFile(join(source, "marketing-assets", "creative.mp4"), "creative");

    const snapshot = await backupLocalData({
      sourceDirectory: source,
      backupDirectory: destination,
      now: new Date("2026-09-07T10:11:12.000Z"),
    });
    await expect(verifyLocalDataBackup(snapshot)).resolves.toMatchObject({ fileCount: 2 });
    await restoreLocalDataForVerification({
      snapshotDirectory: snapshot,
      targetDirectory: restoreTarget,
      confirmedDisposableTarget: true,
    });
    expect(await readFile(join(restoreTarget, "closer-contracts", "contract.pdf"), "utf8"))
      .toBe("contract");
  });

  it("rejects a modified backup", async () => {
    const root = await mkdtemp(join(tmpdir(), "crm-local-tamper-"));
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "file.txt"), "original");
    const snapshot = await backupLocalData({
      sourceDirectory: source,
      backupDirectory: join(root, "backups"),
    });
    await writeFile(join(snapshot, "files", "file.txt"), "modified");

    await expect(verifyLocalDataBackup(snapshot)).rejects.toThrow(/checksum/i);
  });
});
