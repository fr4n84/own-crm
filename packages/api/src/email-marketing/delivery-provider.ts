export type EmailMarketingRecipient = Readonly<{
  normalizedEmail: string;
  leadId: string;
}>;

export type EmailMarketingApprovedContent = Readonly<{
  status: "approved";
  campaignId: string;
  contentVersionId: string;
  version: number;
  subject: string;
  previewText: string | null;
  bodyText: string;
  approvedAt: Date;
  approvedById: string;
}>;

export type EmailMarketingSenderIdentity = Readonly<{
  email: string;
  name: string;
  replyTo?: string;
}>;

export type EmailMarketingUnsubscribeInstructions = Readonly<{
  url: string;
  headers: Readonly<{
    "List-Unsubscribe": string;
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click";
  }>;
}>;

export type EmailMarketingDeliveryRequest = Readonly<{
  idempotencyKey: string;
  recipient: EmailMarketingRecipient;
  content: EmailMarketingApprovedContent;
  sender: EmailMarketingSenderIdentity;
  unsubscribe: EmailMarketingUnsubscribeInstructions;
}>;

export type EmailMarketingDeliveryResult = Readonly<{
  status: "accepted";
  providerMessageId: string;
}>;

/** Provider implementations translate this application contract to their own SDK or HTTP API. */
export interface EmailMarketingDeliveryProvider {
  deliver(request: EmailMarketingDeliveryRequest): Promise<EmailMarketingDeliveryResult>;
}

export type EmailMarketingDeliveryCapability = Readonly<{
  status: "disabled";
  provider: null;
  reason: "not_configured";
}>;

const DISABLED_CAPABILITY: EmailMarketingDeliveryCapability = Object.freeze({
  status: "disabled",
  provider: null,
  reason: "not_configured",
});

export class EmailMarketingDeliveryDisabledError extends Error {
  readonly code = "EMAIL_MARKETING_DELIVERY_DISABLED" as const;

  constructor() {
    super("Email marketing delivery is disabled because no provider adapter is configured");
    this.name = "EmailMarketingDeliveryDisabledError";
  }
}

export function emailMarketingDeliveryCapability(): EmailMarketingDeliveryCapability {
  return DISABLED_CAPABILITY;
}

export function requireEmailMarketingDeliveryProvider(
  provider: EmailMarketingDeliveryProvider | null | undefined,
): EmailMarketingDeliveryProvider {
  if (!provider) throw new EmailMarketingDeliveryDisabledError();
  return provider;
}
