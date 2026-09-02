import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CommercialObservatoryNavigation } from "./commercial-observatory-navigation";

const mocks = vi.hoisted(() => ({
  pathname: "/observatorio-comercial",
  push: vi.fn(),
  permissions: ["*"] as string[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@crm-fran/ui/permissions", () => ({
  usePermissionState: () => ({ permissions: mocks.permissions }),
}));

afterEach(() => {
  cleanup();
  mocks.push.mockClear();
  mocks.pathname = "/observatorio-comercial";
  mocks.permissions = ["*"];
});

describe("CommercialObservatoryNavigation", () => {
  it("navigates between URL-backed internal tabs", () => {
    render(<CommercialObservatoryNavigation />);

    expect(screen.getByRole("tab", { name: "Observatorio" })).toHaveAttribute("data-active");
    fireEvent.click(screen.getByRole("tab", { name: "Experimentos" }));
    expect(mocks.push).toHaveBeenCalledWith("/observatorio-comercial/experimentos-comerciales");
    fireEvent.click(screen.getByRole("tab", { name: "Evidencia" }));
    expect(mocks.push).toHaveBeenCalledWith("/observatorio-comercial/evidencia-comercial");
    fireEvent.click(screen.getByRole("tab", { name: "Planificación" }));
    expect(mocks.push).toHaveBeenCalledWith("/observatorio-comercial/planificacion");
    fireEvent.click(screen.getByRole("tab", { name: "Inteligencia" }));
    expect(mocks.push).toHaveBeenCalledWith("/observatorio-comercial/inteligencia");
    fireEvent.click(screen.getByRole("tab", { name: "Feedback" }));
    expect(mocks.push).toHaveBeenCalledWith("/observatorio-comercial/feedback");
  });

  it("shows only permitted tabs to leads readers", () => {
    mocks.permissions = ["leads:read"];
    render(<CommercialObservatoryNavigation />);

    expect(screen.getByRole("tab", { name: "Inteligencia" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidencia" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Feedback" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Observatorio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Experimentos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Planificación" })).not.toBeInTheDocument();
  });

  it("shows lead tabs to roles with the domain wildcard permission", () => {
    mocks.permissions = ["leads:*"];
    render(<CommercialObservatoryNavigation />);

    expect(screen.getByRole("tab", { name: "Inteligencia" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidencia" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Feedback" })).toBeInTheDocument();
  });

  it("restores intelligence and feedback from their subroutes", () => {
    mocks.pathname = "/observatorio-comercial/inteligencia";
    render(<CommercialObservatoryNavigation />);
    expect(screen.getByRole("tab", { name: "Inteligencia" })).toHaveAttribute("data-active");
    cleanup();

    mocks.pathname = "/observatorio-comercial/feedback";
    render(<CommercialObservatoryNavigation />);
    expect(screen.getByRole("tab", { name: "Feedback" })).toHaveAttribute("data-active");
  });

  it("restores the experiments tab from its subroute", () => {
    mocks.pathname = "/observatorio-comercial/experimentos-comerciales";
    render(<CommercialObservatoryNavigation />);

    expect(screen.getByRole("tab", { name: "Experimentos" })).toHaveAttribute("data-active");
  });

  it("restores the evidence tab from its subroute", () => {
    mocks.pathname = "/observatorio-comercial/evidencia-comercial";
    render(<CommercialObservatoryNavigation />);

    expect(screen.getByRole("tab", { name: "Evidencia" })).toHaveAttribute("data-active");
  });

  it("restores the planning tab from its subroute", () => {
    mocks.pathname = "/observatorio-comercial/planificacion";
    render(<CommercialObservatoryNavigation />);

    expect(screen.getByRole("tab", { name: "Planificación" })).toHaveAttribute("data-active");
  });
});
