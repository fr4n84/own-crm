import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CloserQAForm from "./closer-qa-form";

afterEach(() => {
  cleanup();
});

// ── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  recordCloserAnswersMutationOptions: vi.fn(() => ({
    mutationKey: ["leads", "recordCloserAnswers"],
  })),
  assignLeadMutationOptions: vi.fn(() => ({
    mutationKey: ["leads", "assignLead"],
  })),
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    leads: {
      recordCloserAnswers: {
        mutationOptions: mocks.recordCloserAnswersMutationOptions,
      },
      assignLead: {
        mutationOptions: mocks.assignLeadMutationOptions,
      },
      listAll: {
        queryKey: vi.fn(() => ["leads", "listAll"]),
      },
      listByUserId: {
        queryKey: vi.fn(() => ["leads", "listByUserId"]),
      },
    },
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useMutation: vi.fn(() => ({
      mutate: mocks.mutate,
      isPending: false,
      status: "idle",
      isSuccess: false,
      isError: false,
    })),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

describe("CloserQAForm — integración con el drawer", () => {
  it("renders the form with the expected id for the drawer's submit button to attach", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CloserQAForm leadId="lead-1" leadQuestions={[]} />
      </QueryClientProvider>,
    );

    const form = screen.getByTestId("closer-qa-form");
    expect(form).toBeInTheDocument();
    expect(form.tagName).toBe("FORM");
    expect(form).toHaveAttribute("id", "closer-qa-form");
    expect(screen.getByLabelText("¿Qué ha ocurrido?")).toBeInTheDocument();
  });

  it("does NOT render any submit button of its own (el padre controla el submit)", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CloserQAForm leadId="lead-1" leadQuestions={[]} />
      </QueryClientProvider>,
    );

    const form = screen.getByTestId("closer-qa-form");
    const submitButtons = form.querySelectorAll('button[type="submit"]');
    expect(submitButtons).toHaveLength(0);
  });

  it("renders and submits independent closer feedback", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <CloserQAForm
          leadId="lead-1"
          leadQuestions={[
            {
              questionKey: "isContacted",
              question: "¿Fue contactado?",
              answer: "Si",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "closerOutcome",
              question: "Resultado de la agenda",
              answer: "Venta",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "isDecisionMaker",
              question: "¿Es el decisor?",
              answer: "Si",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "decisionMakerName",
              question: "¿Quién es la persona correcta?",
              answer: "Decision Maker",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "financialSource",
              question: "¿De dónde sale su capacidad económica?",
              answer: "Salary",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "productFit",
              question: "Producto recomendado",
              answer: "Product 1",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "urgencyReason",
              question: "¿De dónde sale la urgencia?",
              answer: "Soon",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "scheduledDate",
              question: "Fecha",
              answer: "2099-01-01",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "scheduledTime",
              question: "Hora",
              answer: "10:00",
              authorRole: "closer",
              authorId: "closer-1",
            },
          ]}
        />
      </QueryClientProvider>,
    );

    const feedback = screen.getByLabelText("Feedback del closer");
    await user.type(feedback, "Llamar nuevamente la próxima semana");

    const form = screen.getByTestId("closer-qa-form");
    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    form.appendChild(submitButton);
    await user.click(submitButton);

    await waitFor(() => {
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: "lead-1",
          questions: expect.arrayContaining([
            expect.objectContaining({
              questionKey: "closerOutcome",
              answer: "Venta",
            }),
            expect.objectContaining({
              questionKey: "closerFeedback",
              answer: "Llamar nuevamente la próxima semana",
            }),
          ]),
        }),
        expect.any(Object),
      );
    });
  });

  it("shows No interesado as a structured agenda outcome", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CloserQAForm
          leadId="lead-1"
          leadQuestions={[
            {
              questionKey: "isContacted",
              question: "¿Fue contactado?",
              answer: "Si",
              authorRole: "closer",
              authorId: "closer-1",
            },
            {
              questionKey: "closerOutcome",
              question: "Resultado de la agenda",
              answer: "No interesado",
              authorRole: "closer",
              authorId: "closer-1",
            },
          ]}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("¿Qué ha ocurrido?")).toHaveTextContent(
      "No interesado",
    );
  });
});
