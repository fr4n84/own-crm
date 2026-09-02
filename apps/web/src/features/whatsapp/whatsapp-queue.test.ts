import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/features/whatsapp/whatsapp-queue.tsx"), "utf8");

describe("WhatsApp queue", () => {
  it("stays intentionally limited to two states and the requested filters", () => {
    expect(source).toContain('value="pending"');
    expect(source).toContain("Pendientes");
    expect(source).toContain('value="sent"');
    expect(source).toContain("Enviados");
    expect(source).toContain("Desde");
    expect(source).toContain("Hasta");
    expect(source).toContain("Caller");
    expect(source).toContain("Checkbox");
    expect(source).not.toContain("plantilla");
    expect(source).not.toContain("mensaje");
  });
});
