import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./assign-to-caller.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../../routers/leads.ts", import.meta.url), "utf8");

describe("assignLeadToCaller prospective guard contract", () => {
  it("serializes assignments by locking the authenticated user row", () => {
    expect(source).toContain('.for("update")');
    expect(source.indexOf('.for("update")')).toBeLessThan(
      source.indexOf("const callerLeads"),
    );
  });

  it("uses the persisted activation and database clock marker", () => {
    expect(source).toContain("CALLER_SINGLE_UNWORKED_LEAD");
    expect(source).toContain("callerAssignedAt");
    expect(source).toContain("transaction_timestamp()");
  });

  it("keeps self-assignment behind the existing leads write permission", () => {
    expect(routerSource).toMatch(
      /assignLeadToCaller:\s*permittedProcedure\(\["leads:write"\]\)/,
    );
  });
});
