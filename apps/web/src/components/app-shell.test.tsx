import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/login" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => <aside data-testid="private-sidebar" /> }));
vi.mock("@/components/active-title", () => ({ ActiveTitle: () => null }));
vi.mock("@/components/mode-toggle", () => ({ ModeToggle: () => null }));
vi.mock("@/features/alerts/alert-button", () => ({ AlertButton: () => null }));
vi.mock("@crm-fran/ui/components/site-header", () => ({ SiteHeader: ({ children }: { children?: React.ReactNode }) => <header>{children}</header> }));
vi.mock("@crm-fran/ui/components/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AppShell } from "./app-shell";

afterEach(cleanup);

describe("application shell", () => {
  it("renders login without any private navigation shell", () => {
    mocks.pathname = "/login";
    render(<AppShell><div>Acceso</div></AppShell>);
    expect(screen.getByText("Acceso")).toBeTruthy();
    expect(screen.queryByTestId("private-sidebar")).toBeNull();
  });

  it("renders the private shell outside auth routes", () => {
    mocks.pathname = "/";
    render(<AppShell><div>Panel</div></AppShell>);
    expect(screen.getByTestId("private-sidebar")).toBeTruthy();
  });
});
