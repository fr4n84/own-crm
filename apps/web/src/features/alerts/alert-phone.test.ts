import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const alertsHookSource = readFileSync(resolve(process.cwd(), "src/features/alerts/use-alerts.ts"), "utf8");
const alertCardSource = readFileSync(resolve(process.cwd(), "src/features/alerts/alert-card.tsx"), "utf8");

describe("alert lead phone", () => {
  it("keeps the phone in the alert view model and displays it on the card", () => {
    expect(alertsHookSource).toContain("phone: alert.lead.phone");
    expect(alertCardSource).toContain("Teléfono:");
    expect(alertCardSource).toContain("tel:${alert.lead.phone}");
  });
});
