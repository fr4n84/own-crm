import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalStatisticsNavigation } from "./personal-statistics-navigation";

const mocks = vi.hoisted(() => ({ pathname: "/estadisticas-personales", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push }) }));

afterEach(() => { cleanup(); mocks.pathname = "/estadisticas-personales"; mocks.push.mockClear(); });

describe("PersonalStatisticsNavigation", () => {
  it("navigates through 48px URL-backed Arc tabs", () => {
    render(<PersonalStatisticsNavigation />);
    expect(screen.getByRole("tab", { name: "Estadísticas" })).toHaveAttribute("data-active");
    fireEvent.click(screen.getByRole("tab", { name: "Rankings" }));
    expect(mocks.push).toHaveBeenCalledWith("/estadisticas-personales/rankings");
  });
});
