import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("./0039_caller_assignment_activation.sql", import.meta.url),
  "utf8",
);

describe("0039 caller assignment activation migration", () => {
  it("captures activation using the database transaction clock", () => {
    expect(sql).toContain("caller_single_unworked_lead");
    expect(sql).toContain("transaction_timestamp()");
  });

  it("leaves historical assignments unmarked", () => {
    expect(sql).toContain('ADD COLUMN "caller_assigned_at" timestamp with time zone');
    expect(sql).not.toMatch(/caller_assigned_at[^;]*(DEFAULT|NOT NULL)/i);
    expect(sql).not.toMatch(/UPDATE\s+"?leads"?/i);
  });
});
