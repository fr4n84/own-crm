import { describe, expect, it } from "vitest";

import type { Context } from "../context";

describe("public API module resolution", () => {
  it(
    "loads the complete public app router and profitability dependencies",
    async () => {
      const { appRouter } = await import("@crm-fran/api/routers/index");
      const caller = appRouter.createCaller({} as Context);

      await expect(caller.healthCheck()).resolves.toBe("OK");
      expect(appRouter._def.procedures).toMatchObject({
        "profitability.overview": expect.anything(),
        "profitability.recordFinancialEvent": expect.anything(),
        "profitability.reverseFinancialEvent": expect.anything(),
      });
    },
    15_000,
  );
});
