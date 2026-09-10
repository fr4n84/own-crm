import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  listDelinquencies: vi.fn(async () => ({ asOf: "2026-09-10", metrics: [], rows: [], exclusions: {} })),
  recordCollectionFollowUp: vi.fn(async () => ({ idempotent: false, eventCount: 3 })),
}));

vi.mock("../receivables/delinquency-service", () => mocks);

import { closerSalesRouter, collectionFollowUpInput } from "./closer-sales";

function context(permissions: string[], actorId = "closer-1"): Context {
  return {
    session: {
      user: {
        id: actorId,
        roleId: "role-1",
        name: "Closer",
        email: "closer@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    role: { id: "role-1", name: "Closer", permissions },
    permissions,
  } as Context;
}

const followUp = {
  installmentId: "installment-1",
  operationId: "c77c7ca1-86a9-40a1-860b-84746e429519",
  contactNote: "Cliente contactado",
  nextActionOn: "2026-09-12",
  nextActionNote: "Volver a llamar",
};

describe("closerSales delinquencies", () => {
  beforeEach(() => {
    mocks.listDelinquencies.mockClear();
    mocks.recordCollectionFollowUp.mockClear();
  });

  it("scopes sales:read to the authenticated closer and gives wildcard Admin full scope", async () => {
    await closerSalesRouter.createCaller(context(["sales:read"])).delinquencies();
    expect(mocks.listDelinquencies).toHaveBeenLastCalledWith({
      actorId: "closer-1",
      canReadAll: false,
    });

    await closerSalesRouter.createCaller(context(["*"], "admin-1")).delinquencies();
    expect(mocks.listDelinquencies).toHaveBeenLastCalledWith({
      actorId: "admin-1",
      canReadAll: true,
    });

    await expect(
      closerSalesRouter.createCaller(context(["sales:write"])).delinquencies(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires sales:write plus ownership in the service, while wildcard remains allowed", async () => {
    await closerSalesRouter.createCaller(context(["sales:write"])).recordCollectionFollowUp(followUp);
    expect(mocks.recordCollectionFollowUp).toHaveBeenLastCalledWith({
      ...followUp,
      actorId: "closer-1",
      canManageAll: false,
    });

    await closerSalesRouter.createCaller(context(["*"], "admin-1")).recordCollectionFollowUp(followUp);
    expect(mocks.recordCollectionFollowUp).toHaveBeenLastCalledWith({
      ...followUp,
      actorId: "admin-1",
      canManageAll: true,
    });

    await expect(
      closerSalesRouter.createCaller(context(["sales:read"])).recordCollectionFollowUp(followUp),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates bounded plain-text notes, dates and operation ids", () => {
    expect(collectionFollowUpInput.parse(followUp)).toEqual(followUp);
    expect(() => collectionFollowUpInput.parse({ ...followUp, contactNote: " " })).toThrow();
    expect(() => collectionFollowUpInput.parse({ ...followUp, contactNote: "x".repeat(1001) })).toThrow();
    expect(() => collectionFollowUpInput.parse({ ...followUp, nextActionOn: "2026-02-30" })).toThrow();
    expect(() => collectionFollowUpInput.parse({ ...followUp, operationId: "retry" })).toThrow();
  });
});
