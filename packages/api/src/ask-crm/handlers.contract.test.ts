import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ASK_CRM_CATALOG } from "./domain";
import { ASK_CRM_HANDLERS } from "./handlers";

describe("Pregúntale al CRM handler boundary", () => {
  it("has exactly one static handler for every catalog question", () => {
    expect(Object.keys(ASK_CRM_HANDLERS).sort()).toEqual(ASK_CRM_CATALOG.map((item) => item.id).sort());
    expect(Object.values(ASK_CRM_HANDLERS).every((handler) => typeof handler === "function")).toBe(true);
  });

  it("does not call write-bearing decision/ranking services or expose private row fields", () => {
    const source = readFileSync(new URL("./handlers.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/decisionCenterService\.weekly|getRankings|\.insert|\.update|\.delete|\.mutation|\bsql`/);
    expect(source).not.toMatch(/leadId\s*:|email\s*:|phone\s*:|transcript\s*:|evidenceRef/);
    expect(source).toContain("ASK_CRM_MAX_ROWS");
    expect(source).toContain("No se exponen transcripciones");
  });
});
