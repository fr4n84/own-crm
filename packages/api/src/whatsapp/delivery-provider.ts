export type WhatsappDeliveryRequest = Readonly<{
  outboxMessageId: string;
  idempotencyKey: string;
  recipient: string;
  bodyText: string;
}>;

export type WhatsappDeliveryReceipt = Readonly<{
  providerMessageId: string;
  acceptedAt: Date;
}>;

export type WhatsappDeliveryCapability = Readonly<{
  enabled: boolean;
  provider: "meta_whatsapp_cloud";
  reason: string;
}>;

export interface WhatsappDeliveryProvider {
  capability(): WhatsappDeliveryCapability;
  deliver(request: WhatsappDeliveryRequest): Promise<WhatsappDeliveryReceipt>;
}

export class DisabledWhatsappDeliveryProvider implements WhatsappDeliveryProvider {
  constructor(private readonly reason: string) {}

  capability(): WhatsappDeliveryCapability {
    return {
      enabled: false,
      provider: "meta_whatsapp_cloud",
      reason: this.reason,
    };
  }

  async deliver(_request: WhatsappDeliveryRequest): Promise<WhatsappDeliveryReceipt> {
    throw new Error("WhatsApp delivery is disabled");
  }
}

const disabledProvider = new DisabledWhatsappDeliveryProvider("provider_not_activated");

export function whatsappDeliveryCapability() {
  return disabledProvider.capability();
}
