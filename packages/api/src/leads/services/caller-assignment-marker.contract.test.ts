import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assignmentSource = readFileSync(
  new URL("./assign-to-caller.ts", import.meta.url),
  "utf8",
);
const feedbackSource = readFileSync(
  new URL("./assign-lead.ts", import.meta.url),
  "utf8",
);
const recurringSource = readFileSync(
  new URL("../../alerts/services/process-recurring.ts", import.meta.url),
  "utf8",
);

describe("caller assignment epoch marker", () => {
  it("starts a new governed epoch when a caller takes a lead", () => {
    expect(assignmentSource).toMatch(
      /callerId:\s*userId,[\s\S]*callerAssignedAt:\s*sql`transaction_timestamp\(\)`/,
    );
  });

  it("clears the marker when wrong-number feedback releases the caller", () => {
    expect(feedbackSource).toContain(
      "callerAssignedAt: isWrongNumber ? null : lead.callerAssignedAt",
    );
  });

  it("clears the marker when recurring processing releases the caller", () => {
    expect(recurringSource).toMatch(
      /callerId:\s*null,[\s\S]*callerAssignedAt:\s*null/,
    );
  });
});
