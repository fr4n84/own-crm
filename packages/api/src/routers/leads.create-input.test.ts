import { describe, expect, it } from "vitest";

import { createLeadInput } from "./leads";

describe("createLeadInput", () => {
  const lead = {
    name: "Imported lead",
    email: "imported@example.com",
    phone: "600000000",
  };

  it.each(["maestra", "vsl"] as const)(
    "accepts imported %s leads",
    (type) => {
      expect(createLeadInput.safeParse({ ...lead, type }).success).toBe(true);
    },
  );

  it("rejects the obsolete agenda lead type", () => {
    expect(createLeadInput.safeParse({ ...lead, type: "agenda" }).success).toBe(
      false,
    );
  });

  it("defaults imported leads without a type to maestra", () => {
    const result = createLeadInput.safeParse(lead);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid imported lead");
    expect(result.data.type).toBe("maestra");
  });

  it("accepts complete acquisition attribution from incoming lead data", () => {
    const result = createLeadInput.safeParse({
      ...lead,
      source: "Meta Ads",
      campaign: "VSL Agosto",
      ad: "Vídeo 03",
      creative: "UGC testimonio",
      acquisitionAngle: "Libertad de tiempo",
      utmContent: "video-03-hook-a",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid imported lead");
    expect(result.data).toMatchObject({
      source: "Meta Ads",
      campaign: "VSL Agosto",
      ad: "Vídeo 03",
      creative: "UGC testimonio",
      acquisitionAngle: "Libertad de tiempo",
      utmContent: "video-03-hook-a",
    });
  });

  it("rejects blank and unbounded acquisition values", () => {
    expect(createLeadInput.safeParse({ ...lead, ad: "   " }).success).toBe(false);
    expect(createLeadInput.safeParse({ ...lead, creative: "x".repeat(201) }).success).toBe(false);
  });
});
