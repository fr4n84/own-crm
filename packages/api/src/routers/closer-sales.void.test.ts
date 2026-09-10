import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  voidCloserSale: vi.fn(async () => ({ leadId: "lead-1", idempotent: false })),
}));

vi.mock("../closer-sales/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../closer-sales/service")>()),
  voidCloserSale: mocks.voidCloserSale,
}));

import { closerSaleVoidInput, closerSalesRouter } from "./closer-sales";

function context(permissions: string[]): Context {
  return {
    session: {
      user: {
        id: "admin-1",
        roleId: "role-1",
        name: "Admin",
        email: "admin@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    role: { id: "role-1", name: "Admin", permissions },
    permissions,
  } as Context;
}

const validInput = {
  leadId: "lead-1",
  reason: "Duplicated signed contract",
  operationId: "c77c7ca1-86a9-40a1-860b-84746e429519",
};

describe("closerSales.void", () => {
  beforeEach(() => mocks.voidCloserSale.mockClear());

  it("validates a bounded reason and UUID operation", () => {
    expect(closerSaleVoidInput.parse(validInput)).toEqual(validInput);
    expect(() => closerSaleVoidInput.parse({ ...validInput, reason: "   " })).toThrow();
    expect(() => closerSaleVoidInput.parse({ ...validInput, reason: "x".repeat(1001) })).toThrow();
    expect(() => closerSaleVoidInput.parse({ ...validInput, operationId: "retry-me" })).toThrow();
  });

  it("allows wildcard Admin and injects the authenticated actor", async () => {
    const result = await closerSalesRouter.createCaller(context(["*"])).void(validInput);

    expect(result).toMatchObject({ leadId: "lead-1" });
    expect(mocks.voidCloserSale).toHaveBeenCalledWith({
      ...validInput,
      actorId: "admin-1",
    });
  });

  it("never treats sales:write as authority to void", async () => {
    await expect(
      closerSalesRouter.createCaller(context(["sales:write"])).void(validInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.voidCloserSale).not.toHaveBeenCalled();
  });
});
