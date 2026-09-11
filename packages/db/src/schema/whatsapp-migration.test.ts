import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "src/migrations/0052_clumsy_jimmy_woo.sql"), "utf8");

describe("WhatsApp outbox migration safeguards", () => {
  it("makes audit events append-only and freezes message payloads", () => {
    expect(migration).toContain('CREATE TRIGGER "whatsapp_consent_events_immutable"');
    expect(migration).toContain('CREATE TRIGGER "whatsapp_outbox_events_immutable"');
    expect(migration).toContain('CREATE TRIGGER "whatsapp_outbox_payload_immutable"');
  });
});
