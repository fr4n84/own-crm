import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/leads/assigned-leads-table.tsx", "utf8");

describe("personal leads Arc visual contract", () => {
  it("keeps personal ownership queries separate from the admin overview", () => {
    expect(source).toContain("trpc.leads.listByUserId");
    expect(source).toContain("trpc.leads.listAll");
    expect(source).toContain("isAdmin");
  });

  it("provides compact summary, search, filters, and bounded responsive results", () => {
    expect(source).toContain("dashboard-arc-theme");
    expect(source).toContain('aria-label="Resumen de leads personales"');
    expect(source).toContain('aria-label="Buscar leads personales"');
    expect(source).toContain("max-h-[36rem]");
    expect(source).toContain("overflow-auto");
    expect(source).toContain("No se pudieron cargar los leads personales");
    expect(source).not.toMatch(/(?:bg|text|border)-(?:blue|red|green|yellow|gray|slate|zinc|neutral|stone)-\d{2,3}/);
  });

  it("preserves view history and role-aware operational actions", () => {
    expect(source).toContain("LeadViewDrawer");
    expect(source).toContain("AssignLeadDrawer");
    expect(source).toContain("Acciones disponibles según tus permisos y tu rol operativo");
  });

  it("keeps canonical feedback filtering independent over the complete owned dataset", () => {
    expect(source).toContain("Tipo de feedback");
    expect(source).toContain("matchesCallerFeedbackFilter(lead.questions, selectedFeedback)");
    expect(source).toContain("trpc.leads.listByUserId.queryOptions()");
    expect(source).toContain("data={filteredLeads ?? []}");
  });
});
