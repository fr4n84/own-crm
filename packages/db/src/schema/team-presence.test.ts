import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TEAM_PRESENCE_CATEGORIES, teamPresence } from "./team-presence";

describe("team presence persistence", () => {
  it("stores one coarse current-state row per user without activity history or context", () => {
    expect(TEAM_PRESENCE_CATEGORIES).toEqual(["crm", "sales", "coaching", "administration"]);
    expect(teamPresence.userId).toBeDefined();
    expect(teamPresence.category).toBeDefined();
    expect(teamPresence.lastHeartbeatAt).toBeDefined();
    for (const forbidden of ["path", "url", "route", "leadId", "customerId", "payload", "query", "activityText"]) {
      expect(forbidden in teamPresence).toBe(false);
    }
  });

  it("generates migration 0048 after email marketing with an allowlist and no heartbeat history", () => {
    const migration = readFileSync(fileURLToPath(new URL("../migrations/0048_team_presence.sql", import.meta.url)), "utf8");
    expect(migration).toContain('CREATE TABLE "team_presence"');
    expect(migration).toContain("team_presence_category_check");
    expect(migration).toContain("'crm','sales','coaching','administration'");
    expect(migration).toContain('"user_id" text PRIMARY KEY NOT NULL');
    expect(migration).not.toContain("presence_events");
    expect(migration).not.toContain("lead_activity_events");
  });
});
