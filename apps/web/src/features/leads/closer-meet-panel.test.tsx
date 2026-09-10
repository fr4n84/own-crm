import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CloserMeetPanel } from "./closer-meet-panel";

afterEach(() => cleanup());

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  mutateAsync: vi.fn(),
  queryState: {
    data: [] as unknown[],
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    closerMeet: {
      list: {
        queryOptions: vi.fn((input) => ({ queryKey: ["closerMeet", "list", input] })),
      },
      create: {
        mutationOptions: vi.fn(() => ({ mutationKey: ["closerMeet", "create"] })),
      },
    },
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => mocks.queryState),
    useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
    useMutation: vi.fn(() => ({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
      error: null,
    })),
  };
});

describe("CloserMeetPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryState = { data: [], isLoading: false, error: null };
    mocks.mutateAsync.mockResolvedValue({ id: "meeting-1" });
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
    });
  });

  it("programa una llamada con hora local y refresca el historial", async () => {
    const user = userEvent.setup();
    render(<CloserMeetPanel leadId="lead-1" />);

    await user.type(screen.getByLabelText("Fecha de la llamada"), "2026-09-15");
    await user.type(screen.getByLabelText("Hora de la llamada"), "10:30");
    await user.clear(screen.getByLabelText("Duración en minutos"));
    await user.type(screen.getByLabelText("Duración en minutos"), "45");
    await user.click(screen.getByRole("button", { name: "Programar Google Meet" }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        operationId: "11111111-1111-4111-8111-111111111111",
        leadId: "lead-1",
        scheduledDate: "2026-09-15",
        scheduledTime: "10:30",
        durationMinutes: 45,
      });
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["closerMeet", "list", { leadId: "lead-1" }],
      });
    });
  });

  it("explica la privacidad y muestra solo los enlaces disponibles", () => {
    mocks.queryState = {
      isLoading: false,
      error: null,
      data: [
        {
          id: "meeting-1",
          status: "recording_ready",
          scheduledStart: new Date("2026-09-15T08:30:00.000Z"),
          scheduledEnd: new Date("2026-09-15T09:15:00.000Z"),
          meetingUri: "https://meet.google.com/example",
          calendarEventUrl: "https://calendar.google.com/event/example",
          driveExportUri: "https://drive.google.com/file/example",
          hasTranscript: true,
        },
        {
          id: "meeting-2",
          status: "scheduled",
          scheduledStart: new Date("2026-09-16T08:30:00.000Z"),
          scheduledEnd: new Date("2026-09-16T09:15:00.000Z"),
          meetingUri: "https://meet.google.com/second",
          calendarEventUrl: null,
          driveExportUri: null,
          hasTranscript: false,
        },
      ],
    };

    render(<CloserMeetPanel leadId="lead-1" />);
    expect(screen.getByText(/la llamada se graba y transcribe/i)).toBeInTheDocument();
    expect(screen.getByText(/transcripción se almacena cifrada/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Abrir Meet" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Abrir Calendar" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Ver grabación" })).toHaveLength(1);
    expect(screen.getByText("Transcripción cifrada almacenada")).toBeInTheDocument();
    expect(screen.queryByText(/sensitive transcript/i)).not.toBeInTheDocument();
  });

  it("presenta estados de carga, error y vacío", () => {
    mocks.queryState = { data: [], isLoading: true, error: null };
    const { rerender } = render(<CloserMeetPanel leadId="lead-1" />);
    expect(screen.getByText("Cargando llamadas…")).toBeInTheDocument();

    mocks.queryState = { data: [], isLoading: false, error: new Error("No se pudo cargar") };
    rerender(<CloserMeetPanel leadId="lead-1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");

    mocks.queryState = { data: [], isLoading: false, error: null };
    rerender(<CloserMeetPanel leadId="lead-1" />);
    expect(screen.getByText("Todavía no hay llamadas programadas.")).toBeInTheDocument();
  });
});





