import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Closer Meet transcript repository contract", () => {
  it("updates the encrypted envelope when either fingerprint or provider resource changes", () => {
    const source = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
    expect(source).toContain('or(sql`${closerMeetSessions.transcriptSha256} IS DISTINCT FROM ${input.sha256}`, sql`${closerMeetSessions.transcriptResourceName} IS DISTINCT FROM ${input.transcriptResourceName}`)');
  });
});
