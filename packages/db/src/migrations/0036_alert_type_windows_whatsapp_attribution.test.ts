import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("alert and WhatsApp migration", () => {
  const sql = readFileSync(resolve(process.cwd(), "src/migrations/0036_alert_type_windows_whatsapp_attribution.sql"), "utf8");
  it("copies every existing global alert window into each type", () => {
    expect(sql.match(/= "urgent_threshold_hours"/g)).toHaveLength(5);
    expect(sql.match(/= "warning_threshold_hours"/g)).toHaveLength(5);
  });
  it("backfills the historical caller without reviving leads.caller_id", () => {
    expect(sql).toContain("previousCallerId");
    expect(sql).toContain("caller_assigned");
    expect(sql).not.toContain('SET "caller_id"');
  });
});
