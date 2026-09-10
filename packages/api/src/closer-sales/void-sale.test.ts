import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeVoidCloserSale,
  type VoidCloserSaleStore,
} from "./void-sale";

const now = new Date("2026-09-10T10:00:00.000Z");
const managedSale = {
  id: "lead-1",
  feedback: "venta",
  questions: [{ questionKey: "closerOutcome", question: "Outcome", answer: "Venta", authorRole: "closer" as const, authorId: "closer-1" }],
  mergedIntoLeadId: null,
  record: {
    saleAmountCents: 300_000,
    amountPaidCents: 100_000,
    currency: "EUR",
    soldAt: new Date("2026-09-01T00:00:00.000Z"),
    paymentMethod: "financed" as const,
    financingProvider: "Sequra",
    installmentMonths: 3,
  },
};

function makeStore(
  sale: Awaited<ReturnType<VoidCloserSaleStore["lockSaleEvidence"]>> = managedSale,
): VoidCloserSaleStore & {
  reversals: string[];
  superseded: string[];
  inserted: Array<Record<string, unknown>>;
} {
  const store = {
    reversals: [] as string[],
    superseded: [] as string[],
    inserted: [] as Array<Record<string, unknown>>,
    lockSaleEvidence: vi.fn(async () => sale),
    findByOperationId: vi.fn(async () => null),
    findByLeadId: vi.fn(async () => null),
    listUnreversedFinancialEvents: vi.fn(async () => [
      { id: "event-contract", amountCents: 300_000, currency: "EUR" },
      { id: "event-payment", amountCents: 100_000, currency: "EUR" },
    ]),
    appendReversal: vi.fn(async ({ originalEventId }: { originalEventId: string }) => {
      store.reversals.push(originalEventId);
    }),
    supersedeActiveInstallments: vi.fn(async ({ leadId }: { leadId: string }) => {
      store.superseded.push(leadId);
    }),
    insertVoid: vi.fn(async (input: Record<string, unknown>) => {
      store.inserted.push(input);
      return {
        leadId: input.leadId as string,
        actorId: input.actorId as string,
        reason: input.reason as string,
        operationId: input.operationId as string,
        snapshot: input.snapshot,
        occurredAt: input.occurredAt as Date,
      };
    }),
  };
  return store;
}

const input = {
  leadId: "lead-1",
  actorId: "admin-1",
  reason: "  Duplicated signed contract  ",
  operationId: "c77c7ca1-86a9-40a1-860b-84746e429519",
};

describe("executeVoidCloserSale", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("voids a managed sale without deleting evidence", async () => {
    const store = makeStore();

    const result = await executeVoidCloserSale(store, input, () => now);

    expect(result.idempotent).toBe(false);
    expect(store.reversals).toEqual(["event-contract", "event-payment"]);
    expect(store.superseded).toEqual(["lead-1"]);
    expect(store.inserted).toEqual([
      expect.objectContaining({
        leadId: "lead-1",
        actorId: "admin-1",
        reason: "Duplicated signed contract",
        operationId: input.operationId,
        occurredAt: now,
        snapshot: {
          evidence: "confirmed",
          saleAmountCents: 300_000,
          amountPaidCents: 100_000,
          currency: "EUR",
          soldAt: "2026-09-01T00:00:00.000Z",
          paymentMethod: "financed" as const,
          financingProvider: "Sequra",
          installmentMonths: 3,
        },
      }),
    ]);
  });

  it("supports legacy sales with a minimal null financial snapshot", async () => {
    const store = makeStore({
      ...managedSale,
      questions: [],
      record: null,
    });

    await executeVoidCloserSale(store, input, () => now);

    expect(store.inserted[0]?.snapshot).toEqual({
      evidence: "legacy_partial",
      saleAmountCents: null,
      amountPaidCents: null,
      currency: null,
      soldAt: null,
      paymentMethod: null,
      financingProvider: null,
      installmentMonths: null,
    });
  });

  it("replays the exact operation idempotently without new side effects", async () => {
    const store = makeStore();
    store.findByOperationId = vi.fn(async () => ({
      leadId: input.leadId,
      actorId: input.actorId,
      reason: input.reason.trim(),
      operationId: input.operationId,
      snapshot: {},
      occurredAt: now,
    }));

    const result = await executeVoidCloserSale(store, input, () => now);

    expect(result.idempotent).toBe(true);
    expect(store.listUnreversedFinancialEvents).not.toHaveBeenCalled();
    expect(store.supersedeActiveInstallments).not.toHaveBeenCalled();
    expect(store.insertVoid).not.toHaveBeenCalled();
  });

  it("rejects operation reuse and a second void for the same lead", async () => {
    const reusedOperation = makeStore();
    reusedOperation.findByOperationId = vi.fn(async () => ({
      leadId: "lead-other",
      actorId: input.actorId,
      reason: input.reason.trim(),
      operationId: input.operationId,
      snapshot: {},
      occurredAt: now,
    }));
    await expect(executeVoidCloserSale(reusedOperation, input, () => now)).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<TRPCError>);

    const alreadyVoided = makeStore();
    alreadyVoided.findByLeadId = vi.fn(async () => ({
      leadId: input.leadId,
      actorId: input.actorId,
      reason: "Previous reason",
      operationId: "9f411032-3591-4dcc-a006-cc89e2f3ea15",
      snapshot: {},
      occurredAt: now,
    }));
    await expect(executeVoidCloserSale(alreadyVoided, input, () => now)).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<TRPCError>);
  });

  it.each([
    ["missing", null],
    ["merged", { ...managedSale, mergedIntoLeadId: "lead-primary" }],
    ["not a sale", { ...managedSale, feedback: "no contesta", questions: [], record: null }],
  ])("rejects %s evidence before side effects", async (_label, sale) => {
    const store = makeStore(sale as Awaited<ReturnType<VoidCloserSaleStore["lockSaleEvidence"]>>);

    await expect(executeVoidCloserSale(store, input, () => now)).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
    expect(store.listUnreversedFinancialEvents).not.toHaveBeenCalled();
    expect(store.insertVoid).not.toHaveBeenCalled();
  });
});
