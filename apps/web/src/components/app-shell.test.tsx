import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/login", status: "ready" }));

vi.mock("@/components/app-access", () => ({ useAppAccess: () => ({ status: mocks.status, retry: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => <aside data-testid="private-sidebar" /> }));
vi.mock("@/components/active-title", () => ({ ActiveTitle: () => null }));
vi.mock("@/components/mode-toggle", () => ({ ModeToggle: () => null }));
vi.mock("@/features/alerts/alert-button", () => ({ AlertButton: () => <span data-testid="private-alerts" /> }));
vi.mock("@/features/team-presence/team-presence", () => ({ TeamPresence: () => <span data-testid="team-presence" /> }));
vi.mock("@crm-fran/ui/components/site-header", () => ({ SiteHeader: ({ children, alertButton }: { children?: React.ReactNode; alertButton?: React.ReactNode }) => <header>{children}{alertButton}</header> }));
vi.mock("@crm-fran/ui/components/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AppShell } from "./app-shell";

afterEach(cleanup);
beforeEach(() => { mocks.status = "ready"; });

describe("application shell", () => {
  it("waits for complete access before rendering dashboard or sidebar", () => { mocks.pathname="/"; mocks.status="loading"; render(<AppShell><div>Panel</div></AppShell>); expect(screen.queryByText("Panel")).toBeNull(); expect(screen.queryByTestId("private-sidebar")).toBeNull(); expect(screen.getByRole("status")).toBeTruthy(); });
  it("fails closed on access errors with retry", () => { mocks.pathname="/"; mocks.status="error"; render(<AppShell><div>Panel</div></AppShell>); expect(screen.queryByText("Panel")).toBeNull(); expect(screen.getByRole("button",{name:"Reintentar"})).toBeTruthy(); });
  it.each([
    ["pending", "pendiente de aprobación"],
    ["disabled", "desactivado"],
  ])("shows an actionable %s state without private UI", (status, message) => {
    mocks.pathname = "/usuarios-accesos";
    mocks.status = status;
    render(<AppShell><div>Panel privado</div></AppShell>);
    expect(screen.getByText(new RegExp(message, "i"))).toBeTruthy();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.queryByText("Panel privado")).toBeNull();
    expect(screen.queryByTestId("private-sidebar")).toBeNull();
  });
  it("renders login without any private navigation shell", () => {
    mocks.pathname = "/login";
    render(<AppShell><div>Acceso</div></AppShell>);
    expect(screen.getByText("Acceso")).toBeTruthy();
    expect(screen.queryByTestId("private-sidebar")).toBeNull();
  });

  for (const pathname of ["/signup", "/signup/confirm", "/recuperar-contrasena"]) {
    it(`renders ${pathname} without private navigation or alert queries`, () => {
      mocks.pathname = pathname;
      render(<AppShell><div>Create Account</div></AppShell>);
      expect(screen.getByText("Create Account")).toBeTruthy();
      expect(screen.queryByTestId("private-sidebar")).toBeNull();
      expect(screen.queryByTestId("private-alerts")).toBeNull();
      expect(screen.queryByTestId("team-presence")).toBeNull();
    });
  }
  it("does not treat a similarly named route as public", () => {
    mocks.pathname = "/signup-settings";
    render(<AppShell><div>Private</div></AppShell>);
    expect(screen.getByTestId("private-sidebar")).toBeTruthy();
  });
  it("renders the private shell outside auth routes", () => {
    mocks.pathname = "/";
    render(<AppShell><div>Panel</div></AppShell>);
    expect(screen.getByTestId("private-sidebar")).toBeTruthy();
    expect(screen.getByTestId("team-presence")).toBeTruthy();
  });
});
