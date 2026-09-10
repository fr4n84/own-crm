import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  backupPostgres,
  parsePostgresConnection,
  verifyBackup,
  restorePostgresForVerification,
  verifyRestoreTarget,
} from "./postgres-backup";

const SOURCE_URL = "postgresql://backup_user:super-secret@db.example.com:5432/crm?sslmode=require";

describe("PostgreSQL backup tooling", () => {
  it("passes credentials through the child environment, never process arguments", () => {
    const connection = parsePostgresConnection(SOURCE_URL);

    expect(connection.args).toEqual(["crm"]);
    expect(connection.env).toMatchObject({
      PGHOST: "db.example.com",
      PGPORT: "5432",
      PGUSER: "backup_user",
      PGPASSWORD: "super-secret",
      PGSSLMODE: "require",
    });
    expect(JSON.stringify(connection.args)).not.toContain("super-secret");
  });

  it("creates an atomic custom-format backup and checksum manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crm-backup-test-"));
    const run = vi.fn(async ({ command, args }: { command: string; args: string[] }) => {
      expect(command).toBe("pg_dump");
      const outputArg = args.find((arg) => arg.startsWith("--file="));
      expect(outputArg).toBeDefined();
      await writeFile(outputArg!.slice("--file=".length), "fake custom backup");
    });

    const result = await backupPostgres({
      databaseUrl: SOURCE_URL,
      directory,
      now: new Date("2026-09-07T10:11:12.000Z"),
      run,
    });

    expect(result.backupPath.endsWith("crm-20260907T101112Z.dump")).toBe(true);
    expect(result.manifestPath.endsWith("crm-20260907T101112Z.manifest.json")).toBe(true);
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    expect(manifest).toMatchObject({ format: "postgres-custom", databaseName: "crm" });
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(manifest)).not.toContain("super-secret");
  });

  it("verifies both checksum and pg_restore readability", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crm-backup-verify-"));
    const backupPath = join(directory, "crm.dump");
    const manifestPath = join(directory, "crm.manifest.json");
    await writeFile(backupPath, "known backup");
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        format: "postgres-custom",
        databaseName: "crm",
        createdAt: "2026-09-07T10:11:12.000Z",
        sizeBytes: 12,
        sha256: "06eaaf31d1ce16b2e410c4c74ee05133c5280a8fd07ef939cc0ab86ef426dfe6",
      }),
    );
    const run = vi.fn().mockResolvedValue(undefined);

    await expect(verifyBackup({ backupPath, manifestPath, run })).resolves.toEqual(
      expect.objectContaining({ databaseName: "crm" }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ command: "pg_restore", args: ["--list", backupPath] }),
    );
  });

  it("requires a different, explicitly disposable restore database", () => {
    expect(() => verifyRestoreTarget(SOURCE_URL, SOURCE_URL)).toThrow(/different/i);
    expect(() =>
      verifyRestoreTarget(
        SOURCE_URL,
        "postgresql://verify:secret@other.example.com/crm_production",
      ),
    ).toThrow(/_restore_verify/);
    expect(
      verifyRestoreTarget(
        SOURCE_URL,
        "postgresql://verify:secret@other.example.com/crm_restore_verify?sslmode=require",
      ).databaseName,
    ).toBe("crm_restore_verify");
  });

  it("restores only into an empty disposable target and never puts credentials in arguments", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crm-restore-verify-"));
    const backupPath = join(directory, "crm.dump");
    const manifestPath = join(directory, "crm.manifest.json");
    await writeFile(backupPath, "known backup");
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        format: "postgres-custom",
        databaseName: "crm",
        createdAt: "2026-09-07T10:11:12.000Z",
        sizeBytes: 12,
        sha256: "06eaaf31d1ce16b2e410c4c74ee05133c5280a8fd07ef939cc0ab86ef426dfe6",
      }),
    );
    const run = vi.fn().mockResolvedValue(undefined);
    const target =
      "postgresql://verify_user:target-secret@isolated.example.com/crm_restore_verify?sslmode=require";

    await restorePostgresForVerification({
      sourceUrl: SOURCE_URL,
      targetUrl: target,
      backupPath,
      manifestPath,
      confirmedDisposableTarget: true,
      run,
    });

    expect(run.mock.calls.map(([call]) => call.command)).toEqual([
      "pg_restore",
      "psql",
      "pg_restore",
      "psql",
    ]);
    for (const [call] of run.mock.calls) {
      expect(JSON.stringify(call.args)).not.toContain("target-secret");
      expect(JSON.stringify(call.args)).not.toContain("super-secret");
    }
    expect(run.mock.calls[2]?.[0].args).toContain("--exit-on-error");
  });
});
