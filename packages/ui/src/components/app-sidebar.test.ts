import { describe, expect, it } from "vitest";

import { canViewNavigationItem, observatoryNavigationUrl } from "./app-sidebar";
import { readFileSync } from "node:fs";

const navigationSource = readFileSync(new URL("../lib/navigation-policy.ts", import.meta.url), "utf8");

describe("app sidebar decision-center visibility", () => {
  it("hides global-only navigation from ordinary users", () => {
    expect(canViewNavigationItem({ globalOnly: true }, ["leads:read"])).toBe(false);
    expect(canViewNavigationItem({ globalOnly: true }, ["*"])).toBe(true);
    expect(canViewNavigationItem({}, ["leads:read"])).toBe(true);
  });
  it("names the financial truth destination explicitly", () => {
    expect(navigationSource).toContain("Rentabilidad y verdad económica");
  });
  it("uses the canonical Leads generales route", () => {
    const source = navigationSource;
    expect(source).toContain('url: "/leads-generales"');
    expect(source).not.toContain('url: "/general-leads"');
  });
  it("uses the canonical Leads personales route", () => {
    const source = navigationSource;
    expect(source).toContain('url: "/leads-personales"');
    expect(source).not.toContain('url: "/leads"');
  });
  it("omits unused secondary controls without removing the user footer", () => {
    const source = readFileSync(new URL("./app-sidebar.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('title: "Settings"');
    expect(source).not.toContain('title: "Get Help"');
    expect(source).not.toContain('title: "Search"');
    expect(source).not.toContain("NavSecondary");
    expect(source).toContain("<NavUser user={user} onSignOut={onSignOut} />");
  });
  it("uses Aurea as the visible product name", () => {
    const source = readFileSync(new URL("./app-sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain(">Aurea</span>");
    expect(source).not.toContain("CRM-FRAN");
  });
  it("exposes the simple WhatsApp queue as a lead module", () => {
    expect(navigationSource).toContain('id: "whatsapp"');
    expect(navigationSource).toContain('title: "WhatsApp"');
    expect(navigationSource).toContain('url: "/whatsapp"');
  });
  it("keeps Intelligence and Feedback inside Observatory instead of duplicating them", () => {
    const source = navigationSource;
    expect(source).not.toContain('title: "Inteligencia comercial"');
    expect(source).not.toContain('url: "/inteligencia-comercial"');
    expect(source).not.toContain('title: "Estadísticas de feedback"');
    expect(source).not.toContain('url: "/feedback-statistics"');
  });
  it("keeps Rankings inside Personal Statistics instead of duplicating it", () => {
    const source = navigationSource;
    expect(source).toContain('title: "Estadísticas personales"');
    expect(source).toContain('url: "/estadisticas-personales"');
    expect(source).not.toContain('title: "Rankings"');
    expect(source).not.toContain('url: "/rankings"');
  });
  it("keeps Pregúntale al CRM inside the decision centre instead of duplicating it in the main navigation", () => {
    const source = navigationSource;
    expect(source).toContain('title: "Centro de decisiones"');
    expect(source).not.toContain('title: "Pregúntale al CRM"');
    expect(source).not.toContain('url: "/preguntale-al-crm"');
  });
  it("keeps commercial experiments inside the observatory instead of duplicating it in the main navigation", () => {
    const source = navigationSource;
    expect(source).toContain('title: "Observatorio comercial"');
    expect(source).not.toContain('title: "Experimentos comerciales"');
    expect(source).not.toContain('url: "/experimentos-comerciales"');
  });
  it("keeps commercial evidence inside the observatory instead of duplicating it in the main navigation", () => {
    const source = navigationSource;
    expect(source).toContain('title: "Observatorio comercial"');
    expect(source).not.toContain('title: "Evidencia comercial"');
    expect(source).not.toContain('url: "/evidencia-comercial"');
  });
  it("keeps evidence discoverable for non-admin roles while admins land on the observatory", () => {
    expect(observatoryNavigationUrl(["leads:read"])).toBe("/observatorio-comercial/evidencia-comercial");
    expect(observatoryNavigationUrl(["*"])).toBe("/observatorio-comercial");
  });
  it("keeps commercial planning inside the observatory instead of duplicating it in the main navigation", () => {
    const source = navigationSource;
    expect(source).toContain('title: "Observatorio comercial"');
    expect(source).not.toContain('title: "Planificación comercial"');
    expect(source).not.toContain('url: "/planificacion-comercial"');
  });
  it("adds the wildcard-only users and access destination", () => {
    expect(navigationSource).toContain('title: "Usuarios y accesos"');
    expect(navigationSource).toContain('url: "/usuarios-accesos"');
    expect(navigationSource).toContain("globalOnly: true");
  });
});
