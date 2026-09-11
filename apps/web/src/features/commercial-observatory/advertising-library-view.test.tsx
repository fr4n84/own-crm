import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  permissions: ["leads:read"] as string[],
}));

vi.mock("@crm-fran/ui/permissions", () => ({
  usePermissionState: () => ({ permissions: mocks.permissions }),
}));

vi.mock("./competitor-ad-library-panel", () => ({
  CompetitorAdLibraryPanel: ({ canConfigure }: { canConfigure: boolean }) => (
    <div data-testid="competitor-panel" data-can-configure={String(canConfigure)} />
  ),
}));

vi.mock("./marketing-library-panel", () => ({
  MarketingLibraryPanel: () => <div data-testid="own-library-panel" />,
}));

import { AdvertisingLibraryView } from "./advertising-library-view";

afterEach(() => {
  cleanup();
  mocks.permissions = ["leads:read"];
});

describe("AdvertisingLibraryView", () => {
  it("shows intelligence without configuration controls to a non-Admin viewer", () => {
    render(<AdvertisingLibraryView />);

    expect(screen.getByRole("tab", { name: "Competencia" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Tus anuncios" })).not.toBeInTheDocument();
    expect(screen.getByTestId("competitor-panel")).toHaveAttribute(
      "data-can-configure",
      "false",
    );
    expect(screen.queryByTestId("own-library-panel")).not.toBeInTheDocument();
  });

  it("enables competitor configuration and the own-library tab for Admin", () => {
    mocks.permissions = ["*"];
    render(<AdvertisingLibraryView />);

    expect(screen.getByRole("tab", { name: "Tus anuncios" })).toBeInTheDocument();
    expect(screen.getByTestId("competitor-panel")).toHaveAttribute(
      "data-can-configure",
      "true",
    );
  });
});
