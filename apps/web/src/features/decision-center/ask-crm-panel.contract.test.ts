import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ask-crm-panel.tsx"), "utf8");

describe("Ask CRM integrated panel contract", () => {
  it("uses only the two read queries and exposes every safe response state", () => {
    expect(source).toContain("trpc.askCrm.catalog");
    expect(source).toContain("trpc.askCrm.ask");
    expect(source).not.toContain("useMutation");
    expect(source).toContain("explanation.temporalScope.label");
    expect(source).not.toContain("explanation.period.fromDay");
    for (const state of [
      "clarification_required",
      "insufficient_evidence",
      "unsupported",
      "Acceso restringido",
      "Cómo se calculó",
    ]) {
      expect(source).toContain(state);
    }
  });

  it("keeps bounded in-memory history without browser persistence", () => {
    expect(source).toContain(".slice(");
    expect(source).toContain("0,");
    expect(source).toContain("5,");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
