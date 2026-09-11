import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routers/whatsapp.ts"), "utf8");

describe("WhatsApp outbox router", () => {
  it("exposes preparation and approval but no delivery mutation", () => {
    expect(source).toContain("recordConsent:");
    expect(source).toContain("generateDraft:");
    expect(source).toContain("submitForApproval:");
    expect(source).toContain("approveMessage:");
    expect(source).toContain('permittedProcedure(["leads:write"])');
    expect(source).not.toContain("sendMessage:");
  });
});
