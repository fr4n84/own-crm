import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(
  resolve(import.meta.dirname, relativePath),
  "utf8",
);

describe("sale void production wiring", () => {
  it("locks evidence, reverses only active facts and supersedes active installments", () => {
    const source = read("./service.ts");

    expect(source).toContain('.for("update")');
    expect(source).toContain("listUnreversedFinancialEvents");
    expect(source).toContain('event.kind !== "reversal"');
    expect(source).toContain("!reversedIds.has(event.id)");
    expect(source).toContain("supersedeActiveInstallments");
    expect(source).toContain("isNull(receivableInstallments.supersededAt)");
    expect(source).not.toMatch(/\.delete\(|\bDELETE\s+FROM\b/i);
  });

  it("keeps voided and merged sources out of the active sales list", () => {
    const source = read("./service.ts");

    expect(source).toContain("isNull(leads.mergedIntoLeadId)");
    expect(source).toContain("isNull(closerSaleVoids.leadId)");
  });

  it("rejects reconciliation after a void", () => {
    const source = read("../payment-reconciliation/service.ts");

    expect(source).toContain("closerSaleVoids");
    expect(source).toContain(
      "La venta está anulada y no admite conciliaciones nuevas.",
    );
  });

  it("exports sale and void evidence but not financial idempotency keys", () => {
    const source = read("../admin-export/service.ts");

    expect(source).toContain('"sales.csv": salesData');
    expect(source).toContain('"closer_sale_voids.csv": saleVoidsData');
    expect(source).toContain("!voidedLeadIds.has(sale.leadId)");
    expect(source).toContain('dataset(["leadId", "actorId", "reason", "snapshot", "occurredAt"]');
  });
});
