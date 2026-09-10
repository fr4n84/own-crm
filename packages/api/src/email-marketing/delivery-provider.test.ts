import { describe, expect, it, vi } from "vitest";

import {
  EmailMarketingDeliveryDisabledError,
  emailMarketingDeliveryCapability,
  requireEmailMarketingDeliveryProvider,
  type EmailMarketingDeliveryProvider,
  type EmailMarketingDeliveryRequest,
} from "./delivery-provider";

const approvedRequest = {
  idempotencyKey: "campaign-1:snapshot-1:lead-1",
  recipient: { normalizedEmail: "person@example.com", leadId: "lead-1" },
  content: {
    status: "approved",
    campaignId: "campaign-1",
    contentVersionId: "copy-1",
    version: 1,
    subject: "Subject",
    previewText: null,
    bodyText: "Body",
    approvedAt: new Date("2026-09-09T10:00:00.000Z"),
    approvedById: "admin-1",
  },
  sender: { email: "hello@example.com", name: "Aurea", replyTo: "support@example.com" },
  unsubscribe: {
    url: "https://example.com/unsubscribe/token",
    headers: {
      "List-Unsubscribe": "<https://example.com/unsubscribe/token>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" as const,
    },
  },
} as const satisfies EmailMarketingDeliveryRequest;

describe("email marketing delivery provider contract", () => {
  it("reports a frozen server-owned disabled capability", () => {
    expect(emailMarketingDeliveryCapability()).toEqual({ status: "disabled", provider: null, reason: "not_configured" });
    expect(Object.isFrozen(emailMarketingDeliveryCapability())).toBe(true);
  });

  it("fails closed with a typed error and no provider effect when no adapter exists", () => {
    const effect = vi.fn();
    expect(() => requireEmailMarketingDeliveryProvider(null)).toThrow(EmailMarketingDeliveryDisabledError);
    try {
      requireEmailMarketingDeliveryProvider(undefined);
    } catch (error) {
      expect(error).toMatchObject({ code: "EMAIL_MARKETING_DELIVERY_DISABLED" });
    }
    expect(effect).not.toHaveBeenCalled();
  });

  it("defines a provider-neutral request and normalized accepted result", async () => {
    const deliver = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "message-1" }));
    const adapter = { deliver } satisfies EmailMarketingDeliveryProvider;
    const provider = requireEmailMarketingDeliveryProvider(adapter);
    await expect(provider.deliver(approvedRequest)).resolves.toEqual({ status: "accepted", providerMessageId: "message-1" });
    expect(deliver).toHaveBeenCalledWith(approvedRequest);
  });
});
