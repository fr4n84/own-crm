import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./user-access-lifecycle.ts", import.meta.url), "utf8");

describe("user access lifecycle transaction contract", () => {
  it("serializes admin quorum and target updates with CAS", () => {
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain('.for("update")');
    expect(source).toContain("eq(user.statusVersion, input.expectedVersion)");
    expect(source).toContain('code: "CONFLICT"');
  });
  it("revokes sessions, preserves the user and writes audit", () => {
    expect(source).toContain("transaction.delete(session)");
    expect(source).not.toContain("transaction.delete(user)");
    expect(source).toContain("transaction.insert(userAccessAudit)");
  });
  it("prevents self removal and the final wildcard-admin removal", () => {
    expect(source).toContain("target.id === input.actorId");
    expect(source).toContain("activeAdministrators.filter");
    expect(source).toContain("Debe quedar al menos un administrador global activo");
  });
});
