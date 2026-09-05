import { describe, expect, it } from "vitest";
import { leads } from "./leads";

describe("WhatsApp caller attribution", () => {
  it("stores the caller responsible for the discarded lead independently", () => {
    expect(leads.whatsappCallerId).toBeDefined();
  });
});
