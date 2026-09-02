import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/features/alerts/alert-card.tsx"), "utf8");
const hookSource = readFileSync(resolve(process.cwd(), "src/features/alerts/use-alerts.ts"), "utf8");

describe("alert inline feedback", () => {
  it("opens the existing contact and feedback flow without changing tabs", () => {
    expect(source).toContain("<AssignLeadDrawer");
    expect(source).toContain('mode="post-assignment-feedback"');
    expect(source).toContain('triggerLabel="Registrar gestión"');
    expect(hookSource).toContain("closerId: alert.lead.closerId");
  });
});
