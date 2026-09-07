import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), guard: vi.fn(), redirect: vi.fn() }));
vi.mock("@crm-fran/api/context", () => ({ createContext: mocks.context }));
vi.mock("@crm-fran/api/dashboard/access", () => ({ assertDashboardAccess: mocks.guard }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/dashboard", () => ({ default: () => <div>Contenido privado del Dashboard</div> }));

import DashboardPage from "./page";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ session: { user: { id: "u" } }, role: { id: "role-caller" }, permissions: ["leads:read"] });
  mocks.redirect.mockImplementation((destination: string) => { throw new Error(`REDIRECT:${destination}`); });
});

describe("Dashboard page access", () => {
  it("redirects an excluded authenticated role without rendering private content", async () => {
    mocks.guard.mockRejectedValue(new Error("forbidden"));
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/perfil");
    expect(mocks.redirect).toHaveBeenCalledWith("/perfil");
    expect(screen.queryByText("Contenido privado del Dashboard")).toBeNull();
  });

  it("renders only after the server access guard succeeds", async () => {
    mocks.guard.mockResolvedValue(undefined);
    render(await DashboardPage());
    expect(screen.getByText("Contenido privado del Dashboard")).toBeTruthy();
    expect(mocks.guard).toHaveBeenCalledWith("role-caller", ["leads:read"]);
  });

  it("redirects an unauthenticated request to login before checking dashboard visibility", async () => {
    mocks.context.mockResolvedValue({ session: null, role: null, permissions: [] });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.guard).not.toHaveBeenCalled();
  });
});
