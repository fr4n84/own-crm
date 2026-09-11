import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

describe("server environment validation", () => {
  it("does not print environment values or credential metadata", () => {
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("[ENV DEBUG]");
  });

  it("keeps WhatsApp delivery locked to disabled while Meta activation is unverified", () => {
    expect(source).toContain('WHATSAPP_DELIVERY_PROVIDER: z.literal("disabled")');
    expect(source).toContain("WHATSAPP_META_ACCESS_TOKEN");
    expect(source).toContain("WHATSAPP_META_PHONE_NUMBER_ID");
    expect(source).toContain("WHATSAPP_META_GRAPH_API_VERSION");
  });
});
