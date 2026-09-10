import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { LEAD_ACTIVITY_KIND, leadActivityEvents } from "./lead-activity";

describe("collection activity schema", () => {
  it("links collection events to one receivable installment", () => {
    const config = getTableConfig(leadActivityEvents);

    expect(leadActivityEvents.receivableInstallmentId).toBeDefined();
    expect(Object.values(LEAD_ACTIVITY_KIND)).toEqual(expect.arrayContaining([
      "collection_reviewed",
      "collection_contact_recorded",
      "collection_next_action_scheduled",
    ]));
    expect(config.indexes.some((index) => index.config.name === "lead_activity_events_installment_occurred_idx")).toBe(true);
    expect(config.checks.map((check) => check.name)).toContain(
      "lead_activity_events_collection_installment_check",
    );
  });

  it("generates only the additive 0050 schema changes", () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, "../migrations/0050_collection_activity.sql"),
      "utf8",
    );

    expect(sql).toContain('ADD COLUMN "receivable_installment_id" text');
    expect(sql).toContain('ON DELETE restrict');
    expect(sql).toContain('CREATE INDEX "lead_activity_events_installment_occurred_idx"');
    expect(sql).toContain('ADD CONSTRAINT "lead_activity_events_collection_installment_check"');
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bTRUNCATE\b/i);
  });
});
