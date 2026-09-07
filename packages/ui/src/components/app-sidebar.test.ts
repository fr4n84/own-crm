import { describe, expect, it } from "vitest";

import { canViewNavigationItem, getSidebarNavigation, observatoryNavigationUrl } from "./app-sidebar";
import { readFileSync } from "node:fs";
import { PRIMARY_NAVIGATION_ITEMS } from "../lib/navigation-policy";

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
    expect(source).toContain("<NavUser user={user} onSignOut={onSignOut} onAccount={onAccount} />");
    expect(source.indexOf('href="/sugerencias"')).toBeLessThan(source.indexOf("<NavUser"));
  });
  it("places Messages in the footer before Suggestions without changing role visibility", () => {
    const roles = [
      ["role-caller", ["leads:*", "alerts:*", "users:read"]],
      ["role-closer", ["leads:*", "alerts:*", "sales:*"]],
      ["role-caller-closer", ["leads:*", "alerts:*", "users:read", "sales:*"]],
      ["role-admin", ["*"]],
    ] as const;

    for (const [roleId, permissions] of roles) {
      const navigation = getSidebarNavigation(PRIMARY_NAVIGATION_ITEMS, roleId, permissions);
      expect(navigation.groups.flatMap((group) => group.items).some((item) => item.id === "messages")).toBe(false);
      expect(navigation.messages?.id).toBe("messages");
      expect(navigation.groups.every((group) => group.items.length > 0)).toBe(true);
      expect(navigation.groups.map((group) => group.label).slice(0, 2)).toEqual(["Operación", "Análisis"]);
    }

    const admin = getSidebarNavigation(PRIMARY_NAVIGATION_ITEMS, "role-admin", ["*"]);
    expect(admin.groups.map((group) => group.label)).toEqual(["Operación", "Análisis", "Administración"]);

    const hidden = getSidebarNavigation(PRIMARY_NAVIGATION_ITEMS, "role-caller", ["leads:*", "alerts:*", "users:read"], {
      roleIdsByModule: { messages: ["role-closer", "role-caller-closer", "role-admin"] },
    });
    expect(hidden.messages).toBeUndefined();

    const source = readFileSync(new URL("./app-sidebar.tsx", import.meta.url), "utf8");
    expect(source.indexOf('href={navigation.messages.url}')).toBeLessThan(source.indexOf('href="/sugerencias"'));
    expect(source.indexOf('href="/sugerencias"')).toBeLessThan(source.indexOf("<NavUser"));
    expect(source).toContain('collapsible="offcanvas"');
    expect(source).not.toContain("Collapsible");
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
