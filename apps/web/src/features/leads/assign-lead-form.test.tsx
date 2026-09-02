import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AssignLeadForm from "./assign-lead-form";

afterEach(() => cleanup());

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  listClosersQueryOptions: vi.fn(() => ({ queryKey: ["users", "listClosers"] })),
  assignLeadMutationOptions: vi.fn(() => ({
    mutationKey: ["leads", "assignLead"],
  })),
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    leads: {
      assignLead: { mutationOptions: mocks.assignLeadMutationOptions },
      listByUserId: { queryKey: vi.fn(() => ["leads", "listByUserId"]) },
    },
    users: {
      listClosers: { queryOptions: mocks.listClosersQueryOptions },
    },
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [{ id: "closer-1", name: "Closer 1" }],
      isLoading: false,
    })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
    useMutation: vi.fn(() => ({
      mutate: mocks.mutate,
      isPending: false,
      status: "idle",
    })),
  };
});

function appendSubmitButton() {
  const form = screen.getByTestId("assign-lead-form");
  const button = document.createElement("button");
  button.type = "submit";
  form.appendChild(button);
  return button;
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerTestId: string,
  label: string,
) {
  await user.click(screen.getByTestId(triggerTestId));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("AssignLeadForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutate.mockImplementation((_variables, options) => {
      options?.onSuccess?.();
    });
  });

  it("keeps the first contact decision and sends No directly to the existing alert path", async () => {
    const user = userEvent.setup();
    render(<AssignLeadForm leadId="lead-1" />);

    await chooseOption(user, "isContacted-trigger", "No");

    expect(screen.queryByTestId("outcome-trigger")).not.toBeInTheDocument();
    await user.click(appendSubmitButton());

    await waitFor(() => {
      expect(mocks.mutate).toHaveBeenCalledWith(
        { leadId: "lead-1", isContacted: "No" },
        expect.any(Object),
      );
    });
  });

  it("sends a missing phone number directly to the discarded path", async () => {
    const user = userEvent.setup();
    render(<AssignLeadForm leadId="lead-1" />);

    await chooseOption(user, "isContacted-trigger", "Número no existe");

    expect(screen.queryByTestId("outcome-trigger")).not.toBeInTheDocument();
    await user.click(appendSubmitButton());

    await waitFor(() => {
      expect(mocks.mutate).toHaveBeenCalledWith(
        { leadId: "lead-1", isContacted: "No", phoneStatus: "invalid" },
        expect.any(Object),
      );
    });
  });

  it.each([
    ["No encaja", "not_fit"],
    ["No interesado", "not_interested"],
  ] as const)(
    "shows previous questions as optional for %s",
    async (label, outcome) => {
      const user = userEvent.setup();
      render(<AssignLeadForm leadId="lead-1" />);

      await chooseOption(user, "isContacted-trigger", "Si");
      await chooseOption(user, "outcome-trigger", label);

      expect(screen.getByLabelText("¿Es el decisor?")).toBeInTheDocument();
      expect(
        screen.getByLabelText(
          "¿Es consciente de que es una formación y sabe el precio?",
        ),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Resumen de la llamada")).toBeInTheDocument();
      expect(screen.getByLabelText("Información extra")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Producto recomendado"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Closer asignado")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Importancia de la alerta")).not.toBeInTheDocument();

      await user.click(appendSubmitButton());

      await waitFor(() => {
        expect(mocks.mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            leadId: "lead-1",
            isContacted: "Si",
            outcome,
          }),
          expect.any(Object),
        );
      });
    },
  );

  it("persists the AI summary, full transcript and training awareness separately", async () => {
    const user = userEvent.setup();
    render(<AssignLeadForm leadId="lead-1" />);

    await chooseOption(user, "isContacted-trigger", "Si");
    await chooseOption(user, "outcome-trigger", "No interesado");
    await chooseOption(user, "primary-profile-trigger", "Latino/extranjero");
    await chooseOption(user, "sub-profile-trigger", "Parado/desempleado");
    await user.type(
      screen.getByLabelText(
        "¿Es consciente de que es una formación y sabe el precio?",
      ),
      "Sabe que es una formación y conoce el precio",
    );
    await user.type(screen.getByLabelText("Resumen de la llamada"), "Resumen IA");
    await user.type(
      screen.getByLabelText("Información extra"),
      "Transcripción completa",
    );
    await user.click(appendSubmitButton());

    await waitFor(() => {
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({
              questionKey: "primaryProfile",
              answer: "latino_extranjero",
            }),
            expect.objectContaining({
              questionKey: "subProfile",
              answer: "parado_desempleado",
            }),
            expect.objectContaining({
              questionKey: "trainingAndPriceAwareness",
              answer: "Sabe que es una formación y conoce el precio",
            }),
            expect.objectContaining({
              questionKey: "summary",
              answer: "Resumen IA",
            }),
            expect.objectContaining({
              questionKey: "extraInfo",
              answer: "Transcripción completa",
            }),
          ]),
        }),
        expect.any(Object),
      );
    });
  }, 15_000);

  it("shows previous questions plus alert configuration for future calls", async () => {
    const user = userEvent.setup();
    render(<AssignLeadForm leadId="lead-1" />);

    await chooseOption(user, "isContacted-trigger", "Si");
    await chooseOption(user, "outcome-trigger", "Llamar a futuro");

    expect(screen.getByLabelText("¿Es el decisor?")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Hora")).toBeInTheDocument();
    expect(screen.getByLabelText("Importancia de la alerta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Closer asignado")).not.toBeInTheDocument();
  }, 15_000);

  it("shows previous questions plus closer/date/time for appointments", async () => {
    const user = userEvent.setup();
    render(<AssignLeadForm leadId="lead-1" />);

    await chooseOption(user, "isContacted-trigger", "Si");
    await chooseOption(user, "outcome-trigger", "Agenda");

    expect(screen.getByLabelText("¿Es el decisor?")).toBeInTheDocument();
    expect(screen.getByLabelText("Closer asignado")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Hora")).toBeInTheDocument();
    expect(screen.queryByLabelText("Importancia de la alerta")).not.toBeInTheDocument();
  });
});
