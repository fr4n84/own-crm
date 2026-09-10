import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");

describe("team presence repository contract", () => {
  it("uses one atomic server-side time guard that cannot be bypassed by changing category", () => {
    expect(source).toContain("onConflictDoUpdate");
    expect(source).toContain("setWhere: sql`${teamPresence.lastHeartbeatAt} <= ${staleBefore}`");
    expect(source).not.toContain("teamPresence.category} <>");
  });

  it("lists active users without selecting navigation or lead context", () => {
    expect(source).toContain("eq(user.accessStatus, USER_ACCESS_STATUS.ACTIVE)");
    for (const forbidden of ["leadActivityEvents", "leads.", "pathname", "payload", "queryText"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
