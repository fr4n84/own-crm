import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { receivableAccounts, receivableInstallments, receivablePaymentAllocations } from "./index";

describe("receivable persistence", () => {
  it("keeps versioned schedules and immutable ledger allocations", () => {
    expect(receivableAccounts.activeScheduleVersion).toBeDefined();
    expect(receivableInstallments.scheduleVersion).toBeDefined();
    expect(receivableInstallments.supersededAt).toBeDefined();
    expect(receivablePaymentAllocations.financialEventId).toBeDefined();
  });

  it("backfills existing sales without rewriting their financial ledger", () => {
    const migration = readFileSync(fileURLToPath(new URL("../migrations/0042_receivables.sql", import.meta.url)), "utf8");
    expect(migration).toContain("INSERT INTO \"receivable_accounts\"");
    expect(migration).toContain("FROM \"closer_sale_records\"");
    expect(migration).toContain("INSERT INTO \"receivable_installments\"");
    expect(migration).toContain("INSERT INTO \"receivable_payment_allocations\"");
    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("^[0-9]{4}-[0-9]{2}-[0-9]{2}$");
  });
});
