import { describe, expect, it } from "vitest";

import { createStoredZip, rowsToCsv, safeExportFileName } from "./archive";

describe("administrative export archive", () => {
  it("neutralizes spreadsheet formulas while preserving interoperable CSV", () => {
    const csv = rowsToCsv(["name", "phone"], [{ name: "=IMPORTXML(1)", phone: "+34600111222" }]);
    expect(csv).toContain('"\'=IMPORTXML(1)"');
    expect(csv).toContain('"\'+34600111222"');
  });

  it("creates a deterministic ZIP with safe entry names", () => {
    const zip = createStoredZip([{ name: "leads.csv", content: "id,name\n1,Ana\n" }]);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(zip)).toContain("leads.csv");
    expect(() => createStoredZip([{ name: "../secret.csv", content: "x" }])).toThrow();
    expect(safeExportFileName("2026-09-07T20:00:00.000Z")).toBe("crm-export-20260907T200000Z.zip");
  });
});
