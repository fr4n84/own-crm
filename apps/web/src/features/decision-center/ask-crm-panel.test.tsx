import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AskCrmPanel } from "./ask-crm-panel";

const mocks = vi.hoisted(() => ({
  askQueryOptions: vi.fn((input: unknown) => ({ kind: "ask", input })),
  permissionState: { permissions: ["*"], isLoaded: true, isLoading: false, error: null },
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    askCrm: {
      catalog: { queryOptions: () => ({ kind: "catalog" }) },
      ask: { queryOptions: mocks.askQueryOptions },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { kind: string }) => options.kind === "catalog"
    ? { data: [], isPending: false, isError: false }
    : { data: undefined, isFetching: false, isError: false },
}));

vi.mock("@crm-fran/ui/permissions", () => ({
  usePermissionState: () => mocks.permissionState,
}));

function requestedDays() {
  const calls = mocks.askQueryOptions.mock.calls;
  const input = calls[calls.length - 1]?.[0];
  if (typeof input !== "object" || input === null || !("overrides" in input)) throw new Error("Missing submitted request");
  const overrides = input.overrides;
  if (typeof overrides !== "object" || overrides === null || !("fromDay" in overrides) || !("toDay" in overrides)) throw new Error("Missing submitted period");
  if (typeof overrides.fromDay !== "string" || typeof overrides.toDay !== "string") throw new Error("Invalid submitted period");
  return (Date.parse(`${overrides.toDay}T00:00:00.000Z`) - Date.parse(`${overrides.fromDay}T00:00:00.000Z`)) / 86_400_000 + 1;
}

beforeEach(() => {
  mocks.askQueryOptions.mockClear();
  mocks.permissionState = { permissions: ["*"], isLoaded: true, isLoading: false, error: null };
});
afterEach(cleanup);

describe("AskCrmPanel", () => {
  it("preserves natural-language and explicit period precedence", () => {
    render(<AskCrmPanel />);
    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "Qué anomalías hubo en los últimos 60 días" } });
    fireEvent.click(screen.getByRole("button", { name: "30 d" }));
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(requestedDays()).toBe(30);
  });

  it("preserves the explicit denied state for non-admin users", () => {
    mocks.permissionState = { permissions: ["leads:read"], isLoaded: true, isLoading: false, error: null };
    render(<AskCrmPanel />);
    expect(screen.getByText("Acceso restringido")).toBeInTheDocument();
  });
});
