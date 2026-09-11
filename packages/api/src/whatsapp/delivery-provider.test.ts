import { describe, expect, it } from "vitest";

import { DisabledWhatsappDeliveryProvider } from "./delivery-provider";

describe("WhatsApp delivery provider boundary", () => {
  it("fails closed and never simulates delivery", async () => {
    const provider = new DisabledWhatsappDeliveryProvider("provider_not_activated");

    expect(provider.capability()).toEqual({
      enabled: false,
      provider: "meta_whatsapp_cloud",
      reason: "provider_not_activated",
    });
    await expect(provider.deliver({
      outboxMessageId: "message-1",
      idempotencyKey: "operation-1",
      recipient: "+34600000000",
      bodyText: "Draft approved by a human",
    })).rejects.toThrow("WhatsApp delivery is disabled");
  });
});
