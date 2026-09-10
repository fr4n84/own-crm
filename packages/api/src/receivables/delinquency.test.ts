import { describe, expect, it } from "vitest";

import { buildDelinquencyReport } from "./delinquency";

const sales = [
  {
    leadId: "lead-eur-delinquent",
    leadName: "Ada",
    closer: { id: "closer-1", name: "Closer One" },
    currency: "EUR",
    contractedCents: 30_000,
    installments: [
      { id: "eur-1", sequence: 1, dueOn: "2026-09-08", expectedCents: 10_000 },
      { id: "eur-2", sequence: 2, dueOn: "2026-09-09", expectedCents: 20_000 },
    ],
  },
  {
    leadId: "lead-eur-paid",
    leadName: "Grace",
    closer: { id: "closer-1", name: "Closer One" },
    currency: "EUR",
    contractedCents: 20_000,
    installments: [
      { id: "eur-paid", sequence: 1, dueOn: "2026-09-01", expectedCents: 20_000 },
    ],
  },
  {
    leadId: "lead-usd",
    leadName: "Linus",
    closer: { id: "closer-2", name: "Closer Two" },
    currency: "USD",
    contractedCents: 10_000,
    installments: [
      { id: "usd-1", sequence: 1, dueOn: "2026-09-07", expectedCents: 10_000 },
    ],
  },
];

describe("buildDelinquencyReport", () => {
  it("counts a sale once, keeps currencies separate and reports basis points", () => {
    const report = buildDelinquencyReport({
      asOf: "2026-09-10",
      sales,
      allocations: [
        { installmentId: "eur-1", paymentEventId: "payment-1", amountCents: 4_000 },
        { installmentId: "eur-1", paymentEventId: "payment-reversed", amountCents: 1_000 },
        { installmentId: "eur-paid", paymentEventId: "payment-2", amountCents: 20_000 },
      ],
      reversedPaymentEventIds: new Set(["payment-reversed"]),
      collectionActivities: [],
      exclusions: {
        legacyIncompleteSalesCount: 2,
        unconfiguredSalesCount: 1,
        voidedSalesCount: 1,
      },
    });

    expect(report.metrics).toEqual([
      {
        currency: "EUR",
        configuredSalesCount: 2,
        delinquentSalesCount: 1,
        delinquentSalesBps: 5_000,
        overdueCents: 26_000,
        contractedCents: 50_000,
        collectedCents: 24_000,
        overdueVsContractedBps: 5_200,
        overdueVsCollectedBps: 10_833,
      },
      {
        currency: "USD",
        configuredSalesCount: 1,
        delinquentSalesCount: 1,
        delinquentSalesBps: 10_000,
        overdueCents: 10_000,
        contractedCents: 10_000,
        collectedCents: 0,
        overdueVsContractedBps: 10_000,
        overdueVsCollectedBps: null,
      },
    ]);
    expect(report.exclusions).toEqual({
      legacyIncompleteSalesCount: 2,
      unconfiguredSalesCount: 1,
      voidedSalesCount: 1,
    });
  });

  it("returns one overdue row per pending installment with Madrid calendar days", () => {
    const report = buildDelinquencyReport({
      asOf: "2026-09-10",
      sales,
      allocations: [
        { installmentId: "eur-1", paymentEventId: "payment-1", amountCents: 4_000 },
        { installmentId: "eur-paid", paymentEventId: "payment-2", amountCents: 20_000 },
      ],
      reversedPaymentEventIds: new Set(),
      collectionActivities: [
        {
          installmentId: "eur-1",
          kind: "collection_contact_recorded",
          occurredAt: new Date("2026-09-09T08:00:00.000Z"),
          note: "Primer contacto",
          scheduledFor: null,
        },
        {
          installmentId: "eur-1",
          kind: "collection_contact_recorded",
          occurredAt: new Date("2026-09-09T10:00:00.000Z"),
          note: "Contacto más reciente",
          scheduledFor: null,
        },
        {
          installmentId: "eur-1",
          kind: "collection_next_action_scheduled",
          occurredAt: new Date("2026-09-09T10:00:00.000Z"),
          note: "Volver a llamar",
          scheduledFor: "2026-09-12",
        },
      ],
      exclusions: {
        legacyIncompleteSalesCount: 0,
        unconfiguredSalesCount: 0,
        voidedSalesCount: 0,
      },
    });

    expect(report.rows).toHaveLength(3);
    expect(report.rows.find((row) => row.installmentId === "eur-1")).toMatchObject({
      lead: { id: "lead-eur-delinquent", name: "Ada" },
      currency: "EUR",
      sequence: 1,
      totalInstallments: 2,
      dueOn: "2026-09-08",
      daysOverdue: 2,
      expectedCents: 10_000,
      paidCents: 4_000,
      pendingCents: 6_000,
      financialStatus: "overdue_partial",
      operationalStatus: "next_action_scheduled",
      lastCollectionContact: {
        occurredAt: new Date("2026-09-09T10:00:00.000Z"),
        note: "Contacto más reciente",
      },
      nextAction: {
        scheduledFor: "2026-09-12",
        note: "Volver a llamar",
      },
    });
    expect(report.rows.find((row) => row.installmentId === "usd-1")).toMatchObject({
      financialStatus: "overdue_unpaid",
      operationalStatus: "uncontacted",
      lastCollectionContact: null,
      nextAction: null,
    });
  });
});
