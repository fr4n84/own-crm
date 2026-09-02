import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

describe("Pregúntale al CRM page contract", () => {
  it("contains only a safe legacy redirect and no duplicated CRM query UI", () => {
    expect(source).toContain('redirect("/centro-de-decisiones/preguntale-al-crm")');
    expect(source).not.toContain("trpc.askCrm");
    expect(source).not.toContain("useQuery");
  });
});
