import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assignLeadInput } from "./leads";

describe("lead scheduling input", () => {
  it("rejects an appointment outside a 15-minute slot", () => {
    const result = assignLeadInput.safeParse({ leadId: "lead", isContacted: "Si", outcome: "appointment", closerId: "closer", scheduledDate: "2099-01-01", scheduledTime: "10:17" });
    expect(result.success).toBe(false);
  });
});

describe("WhatsApp caller attribution wiring", () => {
  it("captures the expiring caller and filters by the historical attribution", () => {
    const recurring = readFileSync(resolve(process.cwd(), "src/alerts/services/process-recurring.ts"), "utf8");
    const whatsapp = readFileSync(resolve(process.cwd(), "src/whatsapp/service.ts"), "utf8");
    expect(recurring).toContain("whatsappCallerId: transition.poolStatus === LEAD_POOL_STATUS.DISCARDED ? dueAlert.targetUserId : null");
    expect(whatsapp).toContain("coalesce(${leads.whatsappCallerId}, ${leads.callerId})");
    expect(whatsapp).toContain("eq(attributedCallerId, input.callerId)");
  });
});
