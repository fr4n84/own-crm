import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { closerSaleRecords } from "./closer-sales";

describe("closer sale payment plan", () => {
  it("stores payment classification separately from collected amounts", () => {
    expect(closerSaleRecords.paymentMethod).toBeDefined();
    expect(closerSaleRecords.financingProvider).toBeDefined();
    expect(closerSaleRecords.installmentMonths).toBeDefined();
  });

  it("keeps existing rows unclassified in the generated migration", () => {
    const migration = readFileSync(
      new URL("../migrations/0037_tough_proemial_gods.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain('ADD COLUMN "payment_method" text');
    expect(migration).not.toMatch(/payment_method" text DEFAULT/);
    expect(migration).toContain("closer_sale_records_payment_plan_check");
  });
});
