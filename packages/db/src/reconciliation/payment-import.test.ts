import { describe, expect, it } from "vitest";

import { previewProviderPayments } from "./payment-import";

const csv = [
  "external_reference,amount,currency,occurred_at,lead_email,lead_phone,lead_id",
  "pay-1,120.50,EUR,2026-09-01T10:30:00+02:00,one@example.com,,",
  "pay-2,50,EUR,2026-09-02T10:30:00+02:00,,+34600111222,",
].join("\n");

describe("provider payment preview", () => {
  it("normalizes rows and only auto-matches a single exact account", () => {
    const rows = previewProviderPayments({
      csv,
      leads: [
        { id: "lead-1", name: "One", normalizedEmail: "one@example.com", normalizedPhone: null },
        { id: "lead-2", name: "Shared A", normalizedEmail: null, normalizedPhone: "+34600111222" },
        { id: "lead-3", name: "Shared B", normalizedEmail: null, normalizedPhone: "+34600111222" },
      ],
    });
    expect(rows[0]).toMatchObject({ externalReference: "pay-1", amountCents: 12_050, matchStatus: "matched", matchedLeadId: "lead-1" });
    expect(rows[1]).toMatchObject({ externalReference: "pay-2", matchStatus: "ambiguous", matchedLeadId: null });
    expect(rows[1]?.candidates.map((item) => item.id)).toEqual(["lead-2", "lead-3"]);
  });

  it("marks repeated references and rejects malformed or unsafe money", () => {
    const duplicateCsv = `${csv}\npay-1,10,EUR,2026-09-03T10:30:00+02:00,one@example.com,,`;
    const rows = previewProviderPayments({ csv: duplicateCsv, leads: [] });
    expect(rows[0]?.matchStatus).toBe("duplicate");
    expect(rows[2]?.matchStatus).toBe("duplicate");
    expect(() => previewProviderPayments({ csv: csv.replace("120.50", "12.345"), leads: [] })).toThrow("Importe inválido");
  });
});
