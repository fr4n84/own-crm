import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DecisionCenterNavigation } from "./decision-center-navigation";

const mocks = vi.hoisted(() => ({
  pathname: "/centro-de-decisiones",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

afterEach(() => {
  cleanup();
  mocks.push.mockClear();
  mocks.pathname = "/centro-de-decisiones";
});

describe("DecisionCenterNavigation", () => {
  it("renders the two internal tabs and navigates with a durable URL", () => {
    render(<DecisionCenterNavigation />);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Playbooks" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Decisiones" })).toHaveAttribute(
      "data-active",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Pregúntale al CRM" }));
    expect(mocks.push).toHaveBeenCalledWith(
      "/centro-de-decisiones/preguntale-al-crm",
    );
  });

  it("opens Playbooks through its URL-backed internal tab", () => {
    render(<DecisionCenterNavigation />);
    fireEvent.click(screen.getByRole("tab", { name: "Playbooks" }));
    expect(mocks.push).toHaveBeenCalledWith(
      "/centro-de-decisiones/playbooks",
    );
  });

  it("selects Pregúntale al CRM after refresh on its subroute", () => {
    mocks.pathname = "/centro-de-decisiones/preguntale-al-crm";
    render(<DecisionCenterNavigation />);

    expect(screen.getByRole("tab", { name: "Pregúntale al CRM" })).toHaveAttribute(
      "data-active",
    );
  });

  it("selects Playbooks after refresh on its subroute", () => {
    mocks.pathname = "/centro-de-decisiones/playbooks";
    render(<DecisionCenterNavigation />);

    expect(screen.getByRole("tab", { name: "Playbooks" })).toHaveAttribute(
      "data-active",
    );
  });
});
