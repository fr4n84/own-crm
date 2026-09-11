import { z } from "zod/v4";

export type WhatsappDraftContext = Readonly<{
  source: string | null;
  campaign: string | null;
  acquisitionAngle: string | null;
  confirmedMotivations: readonly string[];
  confirmedObjections: readonly string[];
}>;

type ResponsesClient = {
  responses: {
    create(input: Record<string, unknown>): Promise<unknown>;
  };
};

const generatedDraft = z.object({
  bodyText: z.string().trim().min(1).max(4_000),
}).strict();

export async function generateWhatsappDraft(
  client: ResponsesClient,
  input: { model: string; context: WhatsappDraftContext },
) {
  const response = await client.responses.create({
    model: input.model,
    store: false,
    instructions:
      "Create one concise WhatsApp message draft in Spanish for separate human review. "
      + "Use only the supplied CRM projection. Do not infer sensitive traits, invent facts, "
      + "claim consent, claim approval, or imply that the message has been sent.",
    input: JSON.stringify(input.context),
    text: {
      format: {
        type: "json_schema",
        name: "whatsapp_message_draft",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { bodyText: { type: "string" } },
          required: ["bodyText"],
        },
      },
    },
  });
  const raw = response && typeof response === "object" && "output_parsed" in response
    ? response.output_parsed
    : response && typeof response === "object" && "output_text" in response
      ? JSON.parse(String(response.output_text))
      : null;
  return {
    ...generatedDraft.parse(raw),
    origin: "ai" as const,
    status: "draft" as const,
  };
}
