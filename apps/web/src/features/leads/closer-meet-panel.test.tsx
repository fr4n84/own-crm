import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CloserMeetPanel } from "./closer-meet-panel";

afterEach(() => cleanup());

const mocks = vi.hoisted(() => ({
  analyzeMutateAsync: vi.fn(),
  fetchQuery: vi.fn(),
  invalidateQueries: vi.fn(),
  removeQueries: vi.fn(),
  scheduleMutateAsync: vi.fn(),
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
      readTranscript: {
        queryOptions: vi.fn((input) => ({ queryKey: ["closerMeet", "readTranscript", input] })),
      },
      analyzeTranscripts: {
        mutationOptions: vi.fn(() => ({ mutationKey: ["closerMeet", "analyzeTranscripts"] })),
      },
    },
    commercialCoaching: {
      list: {
        queryKey: vi.fn(() => ["commercialCoaching", "list"]),
      },
    },
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => mocks.queryState),
    useQueryClient: vi.fn(() => ({
      fetchQuery: mocks.fetchQuery,
      invalidateQueries: mocks.invalidateQueries,
      removeQueries: mocks.removeQueries,
    })),
    useMutation: vi.fn((options: { mutationKey?: string[] }) => ({
      mutateAsync: options.mutationKey?.includes("analyzeTranscripts") ? mocks.analyzeMutateAsync : mocks.scheduleMutateAsync,
      isPending: false,
      error: null,
    })),
  };
});

describe("CloserMeetPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryState = { data: [], isLoading: false, error: null };
    mocks.scheduleMutateAsync.mockResolvedValue({ id: "meeting-1" });
    mocks.analyzeMutateAsync.mockResolvedValue({ analysisId: "analysis-1", status: "draft", requiresHumanReview: true });
    mocks.fetchQuery.mockResolvedValue({ sessionId: "meeting-1", transcript: "Contenido sensible visible solo tras solicitarlo.", characterCount: 49 });
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
      expect(mocks.scheduleMutateAsync).toHaveBeenCalledWith({
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

  it("carga la transcripción solo tras una acción deliberada y la elimina de la caché", async () => {
    const user = userEvent.setup();
    mocks.queryState = { isLoading: false, error: null, data: [{ id: "meeting-1", status: "recording_ready", scheduledStart: new Date("2026-09-15T08:30:00.000Z"), scheduledEnd: new Date("2026-09-15T09:15:00.000Z"), meetingUri: null, calendarEventUrl: null, driveExportUri: null, hasTranscript: true }] };
    render(<CloserMeetPanel leadId="lead-1" />);

    expect(screen.queryByText(/contenido sensible visible/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver transcripción" }));

    expect(await screen.findByText(/contenido sensible visible/i)).toBeInTheDocument();
    expect(mocks.fetchQuery).toHaveBeenCalledWith({ queryKey: ["closerMeet", "readTranscript", { sessionId: "meeting-1" }] });
    expect(mocks.removeQueries).toHaveBeenCalledWith({ queryKey: ["closerMeet", "readTranscript", { sessionId: "meeting-1" }], exact: true });
    await user.click(screen.getByRole("button", { name: "Cerrar transcripción" }));
    expect(screen.queryByText(/contenido sensible visible/i)).not.toBeInTheDocument();
  });

  it("genera coaching solo bajo petición y enlaza el borrador privado existente", async () => {
    const user = userEvent.setup();
    mocks.queryState = { isLoading: false, error: null, data: [{ id: "meeting-1", status: "recording_ready", scheduledStart: new Date("2026-09-15T08:30:00.000Z"), scheduledEnd: new Date("2026-09-15T09:15:00.000Z"), meetingUri: null, calendarEventUrl: null, driveExportUri: null, hasTranscript: true }] };
    render(<CloserMeetPanel leadId="lead-1" />);

    expect(mocks.analyzeMutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Generar coaching con IA" }));

    expect(mocks.analyzeMutateAsync).toHaveBeenCalledWith({ leadId: "lead-1" });
    expect(await screen.findByRole("link", { name: "Revisar coaching privado" })).toHaveAttribute("href", "/estadisticas-personales#coaching-personal");
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["commercialCoaching", "list"] });
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