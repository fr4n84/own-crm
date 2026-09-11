import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = [
  "src/features/whatsapp/whatsapp-queue.tsx",
  "src/features/whatsapp/message-preparation-dialog.tsx",
].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");

describe("WhatsApp queue", () => {
  it("preserves the two-state manual queue and its requested filters", () => {
    expect(source).toContain('value="pending"');
    expect(source).toContain("Pendientes");
    expect(source).toContain('value="sent"');
    expect(source).toContain("Enviados");
    expect(source).toContain("Desde");
    expect(source).toContain("Hasta");
    expect(source).toContain("Caller");
    expect(source).toContain("Checkbox");
  });

  it("keeps a visible, accessible confirmation before removing a sent row", () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("optimisticSent");
    expect(source).toContain("setTimeout");
    expect(source).toContain("onMutate");
    expect(source).toContain("onError");
  });

  it("prepares messages behind consent and a separate human approval without sending", () => {
    expect(source).toContain("Preparar mensaje");
    expect(source).toContain("Registrar consentimiento");
    expect(source).toContain("Crear borrador con IA");
    expect(source).toContain("Enviar a aprobación");
    expect(source).toContain("Aprobar borrador");
    expect(source).toContain("trpc.whatsapp.submitForApproval");
    expect(source).toContain("trpc.whatsapp.approveMessage");
    expect(source).not.toContain("trpc.whatsapp.send");
  });
});
