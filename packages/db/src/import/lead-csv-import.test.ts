import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildLeadCsvImport, parseSpanishLeadDate } from "./lead-csv-import";

const header = "LEADS,Fecha,Nombre,Correo,Tel,,Caller,Contactado,Respuesta,3 impactos,ULTIMO CONTACTO,FEEDABCK,utm_source,utm_medium,utm_campaign,utm_content,utm_term,etiqueta,N° Registros";

function ids() {
  let value = 0;
  return () => `lead-${++value}`;
}

describe("lead CSV import", () => {
  it("imports every active row including duplicate and missing emails", () => {
    const csv = [
      header,
      "FALSE,,,,,,,,,,,,,,,,,,",
      'TRUE,"11:53 am | junio 28, 2026",Ana,ana@example.com,600000001,Asignado,Fran,Si,Sí,Tercer impacto,ultima vez 07/08,nota,,,campaña,H2B2A8,,,',
      'TRUE,"12:53 pm | junio 28, 2026",Ana repetida,ana@example.com,600000002,Asignado,Ramon,Si,No,No encaja,,segunda nota,,,campaña,H2B2A9,,,',
      'TRUE,"1:53 pm | junio 28, 2026",, ,600000003,Asignado,,Si,No,Llamar futuro,,,,,H2B2B0,,,',
    ].join("\n");

    const result = buildLeadCsvImport({
      csv,
      users: [
        { id: "user-fran", name: "fran" },
        { id: "user-ramon", name: "Ramon" },
      ],
      createId: ids(),
    });

    expect(result.leads).toHaveLength(3);
    expect(result.summary).toMatchObject({
      activeRows: 3,
      ignoredRows: 1,
      duplicateEmailRows: 1,
      missingEmailRows: 1,
    });
    expect(result.leads.map((lead) => lead.email)).toEqual([
      "ana@example.com",
      "ana@example.com",
      null,
    ]);
    expect(result.leads.map((lead) => lead.type)).toEqual([
      "maestra",
      "maestra",
      "maestra",
    ]);
    expect(result.leads[2]?.name).toBe("Sin nombre");
  });

  it("maps callers case-insensitively and preserves selected CSV fields", () => {
    const csv = [
      header,
      'TRUE,"5:59 pm | junio 29, 2026",Ibai,IBAI@example.com,678987334,Agenda Directa,ANNA,Si,Sí,Agenda llamada,24/08 anna,Feedback libre,,,aurea,H2B2A8,,,',
    ].join("\n");

    const result = buildLeadCsvImport({
      csv,
      users: [{ id: "user-anna", name: "anna" }],
      createId: ids(),
    });
    const lead = result.leads[0];

    expect(lead).toMatchObject({
      id: "lead-1",
      name: "Ibai",
      email: "IBAI@example.com",
      phone: "678987334",
      state: "Asignado",
      callerId: "user-anna",
      response: "Sí",
      feedback: "Feedback libre",
      utmContent: "H2B2A8",
      type: "vsl",
    });
    expect(lead?.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionKey: "csvContacted", answer: "Si" }),
      expect.objectContaining({ questionKey: "csvImpactOutcome", answer: "Agenda llamada" }),
      expect.objectContaining({ questionKey: "csvLastContact", answer: "24/08 anna" }),
      expect.objectContaining({ questionKey: "csvSourceState", answer: "Agenda Directa" }),
      expect.objectContaining({ questionKey: "callerOutcome", answer: "Agenda" }),
    ]));
  });

  it("fails instead of silently losing an unknown caller relationship", () => {
    const csv = [
      header,
      'TRUE,"5:59 pm | junio 29, 2026",Ibai,ibai@example.com,678987334,Asignado,Desconocido,Si,Sí,No encaja,,,,,H2B2A8,,,',
    ].join("\n");

    expect(() => buildLeadCsvImport({ csv, users: [], createId: ids() }))
      .toThrow('Caller "Desconocido"');
  });

  it("parses Spanish source dates without changing their wall-clock values", () => {
    const date = parseSpanishLeadDate("4:03 pm | junio 28, 2026");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(28);
    expect(date.getHours()).toBe(16);
    expect(date.getMinutes()).toBe(3);
  });

  it("keeps the CLI dry-runnable and refuses an accidental duplicate seed", () => {
    const seed = readFileSync(new URL("../../scripts/seed.ts", import.meta.url), "utf8");
    const loadEnv = readFileSync(new URL("../../scripts/load-env.ts", import.meta.url), "utf8");

    expect(seed).toContain('args.includes("--dry-run")');
    expect(seed).toContain('args.includes("--replace")');
    expect(seed).toContain("La tabla leads ya contiene registros");
    expect(seed).toContain("transaction.delete(leads)");
    expect(loadEnv).toContain('".env.local"');
    expect(loadEnv).toContain("override: true");
  });
});
