import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import {
  profitabilityOverviewInput,
  attributionLeadSearchInput,
  profitabilityRouter,
  profitabilitySpendInput,
  recordFinancialEventInput,
  reverseFinancialEventInput,
} from "./profitability";

describe("profitability router contracts", () => {
  it("rejects impossible and inverted report windows", () => {
    expect(() => profitabilityOverviewInput.parse({ from: "2026-02-30", to: "2026-08-23" })).toThrow();
    expect(() => profitabilityOverviewInput.parse({ from: "2026-08-23", to: "2026-08-01" })).toThrow();
    expect(profitabilityOverviewInput.parse({ from: "2026-08-01", to: "2026-08-23" }).currency).toBe("EUR");
    expect(() => profitabilityOverviewInput.parse({ from: "2026-08-01", to: "2026-08-23", currency: "usd" })).toThrow();
  });

  it("requires positive spend and sale values with an ordered period", () => {
    expect(() => profitabilitySpendInput.parse({ source: "Meta", campaign: "Agosto", periodStart: "2026-08-01", periodEnd: "2026-08-31", spendEuros: 0, referenceSaleValueEuros: 2_000 })).toThrow();
    expect(() => profitabilitySpendInput.parse({ source: "Meta", campaign: "Agosto", periodStart: "2026-09-01", periodEnd: "2026-08-31", spendEuros: 1_000, referenceSaleValueEuros: 2_000 })).toThrow();
  });

  it("registers read-only analysis and manual spend management", () => {
    expect(profitabilityRouter._def.procedures).toMatchObject({
      overview: expect.anything(),
      saveSpend: expect.anything(),
      deleteSpend: expect.anything(),
      listFinancialLedger: expect.anything(),
      recordFinancialEvent: expect.anything(),
      reverseFinancialEvent: expect.anything(),
      attributionLeads: expect.anything(),
    });
  });

  it("validates integer cents, ISO currency, timezone and reversal inputs", () => {
    const valid = { leadId: "lead-1", kind: "payment_received", amountCents: 120_000, currency: "EUR", occurredAt: "2026-08-24T12:30:00+02:00", idempotencyKey: "payment-provider-123" };
    expect(recordFinancialEventInput.parse(valid)).toMatchObject({ amountCents: 120_000, currency: "EUR" });
    expect(() => recordFinancialEventInput.parse({ ...valid, amountCents: 1.2 })).toThrow();
    expect(() => recordFinancialEventInput.parse({ ...valid, currency: "eur" })).toThrow();
    expect(() => recordFinancialEventInput.parse({ ...valid, occurredAt: "2026-08-24T12:30:00" })).toThrow();
    expect(() => reverseFinancialEventInput.parse({ leadId: "lead-1", eventId: "event-1", occurredAt: "2026-08-24T12:30:00Z", idempotencyKey: "" })).toThrow();
  });

  it("bounds server-side attribution lead search", () => {
    expect(attributionLeadSearchInput.parse({ query: " ana " })).toEqual({ query: "ana", limit: 25 });
    expect(() => attributionLeadSearchInput.parse({ query: "x".repeat(121) })).toThrow();
    expect(() => attributionLeadSearchInput.parse({ query: "", limit: 51 })).toThrow();
  });

  it("rejects non-admin users before reading financial data", async () => {
    const caller = profitabilityRouter.createCaller({
      session: { user: { id: "caller", roleId: "caller", name: "Caller", email: "caller@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } },
      role: { id: "caller", name: "Caller", permissions: ["leads:read"] },
      permissions: ["leads:read"],
    } as Context);

    await expect(caller.overview({ from: "2026-08-01", to: "2026-08-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.attributionLeads({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.listFinancialLedger({ leadId: "lead-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.recordFinancialEvent({ leadId: "lead-1", kind: "payment_received", amountCents: 1, currency: "EUR", occurredAt: "2026-08-24T10:00:00Z", idempotencyKey: "retry-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
