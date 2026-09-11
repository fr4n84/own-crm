import { describe, expect, it, vi } from "vitest";

import { generateWhatsappDraft } from "./draft";

describe("WhatsApp AI draft", () => {
  it("uses only a bounded CRM projection with OpenAI storage disabled", async () => {
    const create = vi.fn(async (_input: Record<string, unknown>): Promise<unknown> => ({ output_parsed: { bodyText: "Hola, ¿te viene bien hablar?" } }));

    const draft = await generateWhatsappDraft({ responses: { create } }, {
      model: "safe-model",
      context: {
        source: "Meta",
        campaign: "September",
        acquisitionAngle: "time_freedom",
        confirmedMotivations: ["time_freedom"],
        confirmedObjections: ["timing"],
      },
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: false }));
    const request = create.mock.calls[0]?.[0];
    expect(request?.input).toContain("confirmedMotivations");
    expect(request?.input).not.toContain("transcript");
    expect(request?.input).not.toContain("Ana");
    expect(request?.input).not.toContain("confirmedProfile");
    expect(draft).toEqual({
      bodyText: "Hola, ¿te viene bien hablar?",
      origin: "ai",
      status: "draft",
    });
  });
});
