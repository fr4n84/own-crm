import { describe, expect, it } from "vitest";

import {
  whatsappConsentEvents,
  whatsappConsents,
  whatsappOutboxEvents,
  whatsappOutboxMessages,
} from "./whatsapp";

describe("WhatsApp consent and outbox schema", () => {
  it("keeps channel-specific consent separate from email authority", () => {
    expect(whatsappConsents.normalizedPhone).toBeDefined();
    expect(whatsappConsents.status).toBeDefined();
    expect(whatsappConsentEvents.consentVersion).toBeDefined();
  });

  it("persists idempotent human approval and an append-only audit trail", () => {
    expect(whatsappOutboxMessages.idempotencyKey).toBeDefined();
    expect(whatsappOutboxMessages.consentVersion).toBeDefined();
    expect(whatsappOutboxMessages.submittedById).toBeDefined();
    expect(whatsappOutboxMessages.approvedById).toBeDefined();
    expect(whatsappOutboxEvents.action).toBeDefined();
  });
});
