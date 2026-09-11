import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { competitorAdSources, competitorAds, competitorAdSnapshots, competitorAdSyncRuns } from "./competitor-ads";

describe("competitor ad persistence", () => {
  it("exports source, current ad, immutable snapshot, and immutable run tables", () => {
    expect(competitorAdSources).toBeDefined();
    expect(competitorAds).toBeDefined();
    expect(competitorAdSnapshots).toBeDefined();
    expect(competitorAdSyncRuns).toBeDefined();
  });

  it("ships a migration after 0052 with uniqueness and immutable audit guards", () => {
    const migrationsDir = resolve(process.cwd(), "src/migrations");
    const migration = readdirSync(migrationsDir).find((file) => file.startsWith("0053_") && file.endsWith(".sql"));
    expect(migration).toBeDefined();
    const sql = readFileSync(resolve(migrationsDir, migration!), "utf8");
    expect(sql).toContain('CREATE TABLE "competitor_ad_sources"');
    expect(sql).toContain('CREATE TABLE "competitor_ad_snapshots"');
    expect(sql).toContain('CREATE TABLE "competitor_ad_sync_runs"');
    expect(sql).toContain("competitor_ad_snapshots_ad_hash_uidx");
    expect(sql).toContain("competitor_ad_sync_runs_operation_key_uidx");
    expect(sql).toContain("competitor ad snapshots are append-only");
    expect(sql).toContain("competitor ad sync runs are immutable");
  });
});
