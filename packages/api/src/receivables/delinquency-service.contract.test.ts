import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("delinquency persistence contract", () => {
  it("reads one repeatable-read snapshot and scopes non-Admin queries by closer", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "./delinquency-service.ts"),
      "utf8",
    );

    expect(source).toContain("db.transaction");
    expect(source).toContain('isolationLevel: "repeatable read"');
    expect(source).toContain("eq(leads.closerId, input.actorId)");
    expect(source).toContain("canReadAll");
  });

  it("locks and validates an installment before append-only collection events", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "./delinquency-service.ts"),
      "utf8",
    );

    expect(source).toContain('.for("update")');
    expect(source).toContain("activeScheduleVersion");
    expect(source).toContain("executeRecordCollectionFollowUp");
    expect(source).not.toMatch(/\.delete\(|\bDELETE\s+FROM\b|\bsettled\s*:/i);
  });
});
