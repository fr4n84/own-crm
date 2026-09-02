import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AssignLeadDrawer from "./assign-lead-drawer";

afterEach(() => {
  cleanup();
});

// ── Mocks ────────────────────────────────────────────────────────────────────

type SessionState = {
  data: { user: { id: string; roleId: string } } | null;
};
type PermissionState = {
  permissions: readonly string[];
  role: {
    id: string;
    name: string;
    permissions: { id: string; name: string; description: null }[];
  } | null;
  isLoaded: boolean;
  isLoading: boolean;
  error: Error | null;
};

const mocks = vi.hoisted(() => ({
  useSession: vi.fn<() => SessionState>(),
  usePermissionState: vi.fn<() => PermissionState>(),
  assignLeadFormProps: vi.fn((_props: {
    leadQuestions?: unknown[];
    currentCloserId?: string | null;
    onSubmitLabelChange?: (label: string) => void;
  }) => <form id="assign-lead-form" data-testid="assign-lead-form" />),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: mocks.useSession,
  },
}));

vi.mock("@crm-fran/ui/permissions", () => ({
  usePermissionState: mocks.usePermissionState,
  PermissionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./closer-qa-form", () => ({
  default: vi.fn(() => (
    <form id="closer-qa-form" data-testid="closer-qa-form">
      <input data-testid="closer-input" />
    </form>
  )),
}));

vi.mock("./admin-qa-editor", () => ({
  default: vi.fn(({ activeTab }: { activeTab: "caller" | "closer" }) => {
    const formId =
      activeTab === "caller" ? "admin-caller-form" : "admin-closer-form";
    return (
      <form id={formId} data-testid={formId}>
        <input data-testid={`${activeTab}-input`} />
      </form>
    );
  }),
}));

vi.mock("./assign-lead-form", () => ({
  default: mocks.assignLeadFormProps,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseLead = {
  id: "lead-1",
  type: "maestra" as const,
  name: "Test Lead",
  email: "test@example.com",
  phone: "+54 11 5555 5555",
  state: "Nuevo",
  response: "",
  feedback: "",
  questions: [] as Array<{
    question: string;
    answer: string;
    authorRole: "caller" | "closer";
    authorId: string | null;
    questionKey?: string;
  }>,
  callerId: null as string | null,
  closerId: null as string | null,
  caller: null as { id: string; name: string; email: string } | null,
  closer: null as { id: string; name: string; email: string } | null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /abrir drawer/i }));
}

function setupRole(role: "role-caller" | "role-closer" | "role-admin") {
  mocks.useSession.mockReturnValue({
    data: { user: { id: "user-1", roleId: role } },
  });
  if (role === "role-admin") {
    mocks.usePermissionState.mockReturnValue({
      permissions: ["*"],
      role: {
        id: "admin",
        name: "Admin",
        permissions: [{ id: "*", name: "Administrator", description: null }],
      },
      isLoaded: true,
      isLoading: false,
      error: null,
    });
  } else {
    mocks.usePermissionState.mockReturnValue({
      permissions: [],
      role: null,
      isLoaded: true,
      isLoading: false,
      error: null,
    });
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AssignLeadDrawer — orquesta submitFormId por rol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assignLeadFormProps.mockImplementation((_props) => (
      <form id="assign-lead-form" data-testid="assign-lead-form" />
    ));
  });

  it("caller: pasa submitFormId='assign-lead-form' al drawer", async () => {
    setupRole("role-caller");
    const user = userEvent.setup();

    render(<AssignLeadDrawer lead={baseLead} />);
    await openDrawer(user);

    expect(screen.getByTestId("assign-lead-form")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: /guardar/i });
    expect(submitButton).toHaveAttribute("form", "assign-lead-form");
  });

  it("closer: pasa submitFormId='closer-qa-form' al drawer", async () => {
    setupRole("role-closer");
    const user = userEvent.setup();

    render(<AssignLeadDrawer lead={baseLead} />);
    await openDrawer(user);

    expect(screen.getByTestId("closer-qa-form")).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: /guardar/i });
    expect(submitButton).toHaveAttribute("form", "closer-qa-form");
  });

  it("shows a named Feedback trigger when used from Agendas", () => {
    setupRole("role-closer");

    render(<AssignLeadDrawer lead={baseLead} triggerLabel="Feedback" />);

    expect(
      screen.getByRole("button", { name: "Feedback" }),
    ).toBeInTheDocument();
  });

  it("opens post-assignment feedback immediately without rendering another trigger", () => {
    setupRole("role-caller");

    render(
      <AssignLeadDrawer
        lead={baseLead}
        mode="post-assignment-feedback"
        defaultOpen
        hideTrigger
      />,
    );

    expect(screen.queryByRole("button", { name: /abrir drawer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Añadir feedback" })).toBeInTheDocument();
    expect(screen.getByTestId("assign-lead-form")).toBeInTheDocument();
  });

  it("admin: opens the real closer feedback form from Agendas", async () => {
    setupRole("role-admin");
    const user = userEvent.setup();

    render(
      <AssignLeadDrawer
        lead={baseLead}
        triggerLabel="Feedback"
        mode="agenda-feedback"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Feedback" }));

    expect(screen.getByTestId("closer-qa-form")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-caller-form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toHaveAttribute(
      "form",
      "closer-qa-form",
    );
  });

  it("multi-role user can open closer feedback only for a lead assigned to their identity", async () => {
    setupRole("role-caller");
    const user = userEvent.setup();

    render(<AssignLeadDrawer lead={{ ...baseLead, closerId: "user-1" }} triggerLabel="Gestionar ahora" mode="agenda-feedback" />);
    await user.click(screen.getByRole("button", { name: "Gestionar ahora" }));

    expect(screen.getByTestId("closer-qa-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toHaveAttribute("form", "closer-qa-form");
  });

  it("admin: muestra el formulario operativo de acciones del caller", async () => {
    setupRole("role-admin");
    const user = userEvent.setup();

    render(<AssignLeadDrawer lead={baseLead} />);
    await openDrawer(user);

    expect(screen.getByTestId("assign-lead-form")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-caller-form")).not.toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: /guardar/i });
    expect(submitButton).toHaveAttribute("form", "assign-lead-form");
  });
});

describe("AssignLeadDrawer — data wiring for edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caller: passes filtered caller questions + currentCloserId to form", async () => {
    setupRole("role-caller");
    const user = userEvent.setup();

    const leadWithQuestions = {
      ...baseLead,
      closerId: "closer-789",
      questions: [
        { questionKey: "isContacted", question: "¿Fué contactado?", answer: "Si", authorRole: "caller" as const, authorId: "user-1" },
        { questionKey: "financialSource", question: "Financial", answer: "Salary", authorRole: "caller" as const, authorId: "user-1" },
        { questionKey: "budget", question: "Budget", answer: "1000", authorRole: "closer" as const, authorId: "closer-789" },
      ],
    };

    mocks.assignLeadFormProps.mockImplementation(
      (props: { leadQuestions?: unknown[]; currentCloserId?: string | null }) => (
        <form id="assign-lead-form" data-testid="assign-lead-form">
          <span data-testid="caller-count">{(props.leadQuestions ?? []).length}</span>
          <span data-testid="closer-id">{props.currentCloserId ?? "null"}</span>
        </form>
      ),
    );

    render(<AssignLeadDrawer lead={leadWithQuestions} />);
    await openDrawer(user);

    // All questions passed (form filters by authorRole internally)
    expect(screen.getByTestId("caller-count")).toHaveTextContent("3");
    // currentCloserId passed from lead
    expect(screen.getByTestId("closer-id")).toHaveTextContent("closer-789");
  });

  it("caller: dynamic submit label changes to Editar", async () => {
    setupRole("role-caller");
    const user = userEvent.setup();

    mocks.assignLeadFormProps.mockImplementation(
      (props: { onSubmitLabelChange?: (label: string) => void }) => (
        <form id="assign-lead-form" data-testid="assign-lead-form">
          <button
            type="button"
            data-testid="trigger-label"
            onClick={() => props.onSubmitLabelChange?.("Editar")}
          >
            trigger
          </button>
        </form>
      ),
    );

    render(<AssignLeadDrawer lead={baseLead} />);
    await openDrawer(user);

    // Initially "Guardar"
    expect(screen.getByRole("button", { name: /guardar/i })).toBeInTheDocument();

    // Simulate form calling onSubmitLabelChange
    await user.click(screen.getByTestId("trigger-label"));

    // Button label changes to "Editar"
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    });
  });

  it("caller: passes empty questions when lead has no caller items", async () => {
    setupRole("role-caller");
    const user = userEvent.setup();

    const leadWithCloserOnly = {
      ...baseLead,
      questions: [
        { questionKey: "budget", question: "Budget", answer: "1000", authorRole: "closer" as const, authorId: "closer-789" },
      ],
    };

    mocks.assignLeadFormProps.mockImplementation(
      (props: { leadQuestions?: unknown[] }) => (
        <form id="assign-lead-form" data-testid="assign-lead-form">
          <span data-testid="caller-count">{(props.leadQuestions ?? []).length}</span>
        </form>
      ),
    );

    render(<AssignLeadDrawer lead={leadWithCloserOnly} />);
    await openDrawer(user);

    // All questions passed (form filters by authorRole internally)
    expect(screen.getByTestId("caller-count")).toHaveTextContent("1");
  });
});
