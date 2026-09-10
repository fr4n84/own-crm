import { describe, expect, it, vi } from "vitest";

import {
  executeRecordCollectionFollowUp,
  type CollectionFollowUpStore,
} from "./collection-follow-up";

const now = new Date("2026-09-10T10:00:00.000Z");
const input = {
  installmentId: "installment-1",
  actorId: "closer-1",
  canManageAll: false,
  operationId: "c77c7ca1-86a9-40a1-860b-84746e429519",
  contactNote: "Cliente contactado por teléfono",
  nextActionOn: "2026-09-12",
  nextActionNote: "Volver a llamar",
};

function makeStore(
  installment: Awaited<ReturnType<CollectionFollowUpStore["lockInstallment"]>> = {
    installmentId: "installment-1",
    leadId: "lead-1",
    closerId: "closer-1",
    dueOn: "2026-09-08",
    supersededAt: null,
    isActiveSchedule: true,
  },
): CollectionFollowUpStore & { appended: Array<Record<string, unknown>> } {
  const appended: Array<Record<string, unknown>> = [];
  return {
    appended,
    lockInstallment: vi.fn(async () => installment),
    pendingCents: vi.fn(async () => 5_000),
    findByOperationId: vi.fn(async () => null),
    appendEvents: vi.fn(async (events) => {
      appended.push(...events);
    }),
  };
}

describe("executeRecordCollectionFollowUp", () => {
  it("appends reviewed, contact and next-action events with server time", async () => {
    const store = makeStore();

    const result = await executeRecordCollectionFollowUp(store, input, () => now);

    expect(result).toEqual({ idempotent: false, eventCount: 3 });
    expect(store.appended).toEqual([
      expect.objectContaining({
        installmentId: "installment-1",
        leadId: "lead-1",
        actorId: "closer-1",
        kind: "collection_reviewed",
        occurredAt: now,
      }),
      expect.objectContaining({
        kind: "collection_contact_recorded",
        description: "Cliente contactado por teléfono",
        metadata: { schemaVersion: 1, channel: "unspecified" },
      }),
      expect.objectContaining({
        kind: "collection_next_action_scheduled",
        description: "Volver a llamar",
        metadata: { schemaVersion: 1, scheduledFor: "2026-09-12" },
      }),
    ]);
    expect(store.appended.map((event) => event.dedupeKey)).toEqual([
      "collection:c77c7ca1-86a9-40a1-860b-84746e429519:reviewed",
      "collection:c77c7ca1-86a9-40a1-860b-84746e429519:contact",
      "collection:c77c7ca1-86a9-40a1-860b-84746e429519:next-action",
    ]);
  });

  it("replays an identical operation without appending events", async () => {
    const store = makeStore();
    store.findByOperationId = vi.fn(async () => ({
      installmentId: input.installmentId,
      actorId: input.actorId,
      contactNote: input.contactNote,
      nextActionOn: input.nextActionOn,
      nextActionNote: input.nextActionNote,
    }));

    await expect(
      executeRecordCollectionFollowUp(store, input, () => now),
    ).resolves.toEqual({ idempotent: true, eventCount: 3 });
    expect(store.appendEvents).not.toHaveBeenCalled();
  });

  it("rejects operation reuse with different data", async () => {
    const store = makeStore();
    store.findByOperationId = vi.fn(async () => ({
      installmentId: input.installmentId,
      actorId: input.actorId,
      contactNote: "Otro contacto",
      nextActionOn: input.nextActionOn,
      nextActionNote: input.nextActionNote,
    }));

    await expect(
      executeRecordCollectionFollowUp(store, input, () => now),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.appendEvents).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null, 5_000, false],
    ["another closer", { ...makeStoreInstallment(), closerId: "closer-2" }, 5_000, false],
    ["future", { ...makeStoreInstallment(), dueOn: "2026-09-11" }, 5_000, false],
    ["superseded", { ...makeStoreInstallment(), supersededAt: now }, 5_000, false],
    ["inactive schedule", { ...makeStoreInstallment(), isActiveSchedule: false }, 5_000, false],
    ["settled", makeStoreInstallment(), 0, false],
  ])("rejects %s installments", async (_label, installment, pending, canManageAll) => {
    const store = makeStore(installment);
    store.pendingCents = vi.fn(async () => pending);

    await expect(executeRecordCollectionFollowUp(
      store,
      { ...input, canManageAll },
      () => now,
    )).rejects.toMatchObject({
      code: _label === "another closer" ? "FORBIDDEN" : "CONFLICT",
    });
    expect(store.appendEvents).not.toHaveBeenCalled();
  });

  it("rechecks idempotency after the row lock for a concurrent retry", async () => {
    const store = makeStore();
    store.findByOperationId = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        installmentId: input.installmentId,
        actorId: input.actorId,
        contactNote: input.contactNote,
        nextActionOn: input.nextActionOn,
        nextActionNote: input.nextActionNote,
      });

    await expect(
      executeRecordCollectionFollowUp(store, input, () => now),
    ).resolves.toEqual({ idempotent: true, eventCount: 3 });
    expect(store.findByOperationId).toHaveBeenCalledTimes(2);
    expect(store.appendEvents).not.toHaveBeenCalled();
  });
  it("lets wildcard Admin manage another closer's overdue active installment", async () => {
    const store = makeStore({ ...makeStoreInstallment(), closerId: "closer-2" });

    await expect(executeRecordCollectionFollowUp(
      store,
      { ...input, canManageAll: true },
      () => now,
    )).resolves.toMatchObject({ idempotent: false });
  });
});

function makeStoreInstallment() {
  return {
    installmentId: "installment-1",
    leadId: "lead-1",
    closerId: "closer-1",
    dueOn: "2026-09-08",
    supersededAt: null,
    isActiveSchedule: true,
  };
}
