import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { USER_ACCESS_STATUS, user, userAccessAudit } from "./auth";

describe("user access lifecycle schema", () => {
  it("stores a versioned status and append-only audit identities", () => {
    expect(USER_ACCESS_STATUS).toEqual({ PENDING: "pending", ACTIVE: "active", DISABLED: "disabled" });
    expect(user.accessStatus.name).toBe("access_status");
    expect(user.statusVersion.name).toBe("status_version");
    expect(userAccessAudit.targetUserId.name).toBe("target_user_id");
    expect(userAccessAudit.actorUserId.name).toBe("actor_user_id");
  });
  it("activates every pre-existing account before pending becomes the default", () => {
    const migration = readFileSync(new URL("../migrations/0040_user_access_lifecycle.sql", import.meta.url), "utf8");
    const add = migration.indexOf('ADD COLUMN "access_status" text');
    const activate = migration.indexOf('SET "access_status" = \'active\'');
    const pendingDefault = migration.indexOf('SET DEFAULT \'pending\'');
    const required = migration.indexOf('SET NOT NULL');
    expect(add).toBeGreaterThanOrEqual(0);
    expect(add).toBeLessThan(activate);
    expect(activate).toBeLessThan(pendingDefault);
    expect(pendingDefault).toBeLessThan(required);
  });
});
