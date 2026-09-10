import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { closerSaleVoids } from "./closer-sales";

describe("closerSaleVoids schema", () => {
  it("keeps one append-only, attributable and idempotent void per lead", () => {
    const config = getTableConfig(closerSaleVoids);

    expect(Object.keys(closerSaleVoids)).toEqual(expect.arrayContaining([
      "leadId",
      "actorId",
      "reason",
      "operationId",
      "snapshot",
      "occurredAt",
    ]));
    expect(config.foreignKeys).toHaveLength(2);
    expect(config.indexes.some((index) => index.config.unique && index.config.name === "closer_sale_voids_operation_uidx")).toBe(true);
    expect(config.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "closer_sale_voids_reason_chk",
      "closer_sale_voids_operation_uuid_chk",
    ]));
  });

  it("generates a non-destructive 0049 migration with restrictive evidence links", () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, "../migrations/0049_closer_sale_voids.sql"),
      "utf8",
    );

    expect(sql).toContain('CREATE TABLE "closer_sale_voids"');
    expect(sql).toContain('ON DELETE restrict');
    expect(sql).toContain('CREATE UNIQUE INDEX "closer_sale_voids_operation_uidx"');
    expect(sql).toContain('prevent_closer_sale_void_mutation');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "closer_sale_voids"');
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/i);
  });
});

