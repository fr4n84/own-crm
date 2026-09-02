import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AgendasPage from "./page";

const mocks = vi.hoisted(() => ({
  listAllQueryOptions: vi.fn(() => ({ queryKey: ["leads", "listAll"] })),
  useQuery: vi.fn(),
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    leads: { listAll: { queryOptions: mocks.listAllQueryOptions } },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@crm-fran/ui/permissions/can", () => ({
  Can: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@crm-fran/ui/components/data-table", () => ({
  DataTable: ({
    data,
    columns,
  }: {
    data: { id: string; name: string; phone?: string; feedback?: string }[];
    columns: { header?: string }[];
  }) => (
    <div data-testid="agenda-table">
      <div>{columns.map((column) => column.header).join("|")}</div>
      {data.map((row) => (
        <div key={row.id}>
          {row.name} {row.phone} {row.feedback}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@crm-fran/ui/components/empty", () => ({
  Empty: ({ heading }: { heading: string }) => <div>{heading}</div>,
}));

vi.mock("@crm-fran/ui/components/skeleton", () => ({
  Skeleton: () => <div>Loading</div>,
}));

describe("AgendasPage", () => {
  it("renders only agenda leads with dedicated columns", () => {
    mocks.useQuery.mockReturnValue({
      data: [
        {
          id: "agenda-1",
          name: "Agenda Lead",
          phone: "555-0100",
          feedback: "Caller feedback",
          caller: { id: "caller-1", name: "Caller 1" },
          closer: { id: "closer-1", name: "Closer 1" },
          questions: [
            { questionKey: "callerOutcome", answer: "Agenda", authorRole: "caller" },
            { questionKey: "scheduledDate", answer: "2099-01-01", authorRole: "caller" },
            { questionKey: "scheduledTime", answer: "10:00", authorRole: "caller" },
            { questionKey: "closerOutcome", answer: "Seguimiento", authorRole: "closer" },
          ],
        },
        {
          id: "other-1",
          name: "Other Lead",
          caller: null,
          closer: null,
          questions: [
            { questionKey: "callerOutcome", answer: "No encaja", authorRole: "caller" },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<AgendasPage />);

    expect(screen.getByTestId("agenda-table")).toHaveTextContent(
      "Lead|Teléfono|Caller|Feedback del caller|Closer|Feedback closer|Fecha|Hora|Acciones",
    );
    expect(screen.getByText(/Agenda Lead/)).toBeInTheDocument();
    expect(screen.getByText(/555-0100 Caller feedback/)).toBeInTheDocument();
    expect(screen.queryByText("Other Lead")).not.toBeInTheDocument();
    expect(mocks.listAllQueryOptions).toHaveBeenCalledWith();
    expect(
      screen.getByRole("combobox", { name: "Filtrar por lo que sucedió" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no agenda leads", () => {
    mocks.useQuery.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<AgendasPage />);

    expect(screen.getByText("No hay agendas")).toBeInTheDocument();
  });
});
