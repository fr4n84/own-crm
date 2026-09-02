import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CallRecordingPanel } from "./call-recording-panel";

class TestMediaRecorder {
  static isTypeSupported = vi.fn(() => true);

  state: RecordingState = "inactive";
  readonly mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    _stream: MediaStream,
    options?: MediaRecorderOptions,
  ) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: this.mimeType }),
    } as BlobEvent);
    this.onstop?.();
  }
}

function installRecordingEnvironment() {
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }],
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", TestMediaRecorder);
  return { getUserMedia, stopTrack };
}

describe("CallRecordingPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps manual feedback available and requires notice confirmation before recording", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const user = userEvent.setup();

    render(<CallRecordingPanel leadId="lead-1" onDraft={vi.fn()} />);

    expect(screen.getByText(/puedes completar el formulario sin grabar/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /grabar con ia/i }));

    const start = screen.getByRole("button", { name: /iniciar grabación/i });
    expect(start).toBeDisabled();
    expect(getUserMedia).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", {
        name: /he informado al lead/i,
      }),
    );
    expect(start).toBeEnabled();
  });

  it("releases the microphone and returns an editable draft without submitting the form", async () => {
    const { stopTrack } = installRecordingEnvironment();
    const draft = {
      isContacted: "Si",
      outcome: "not_interested",
      primaryProfile: "parado_desempleado",
      subProfile: "",
      motivationAngles: ["financial_stability"],
      isDecisionMaker: "",
      decisionMakerName: "",
      financialSource: "",
      trainingAndPriceAwareness: "",
      urgencyReason: "",
      summary: "Prefiere no continuar",
      extraInfo: "Transcripción completa",
      scheduledDate: "",
      scheduledTime: "",
      alertSeverity: "",
    } as const;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ draft }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onDraft = vi.fn();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    const user = userEvent.setup();

    render(
      <form onSubmit={onSubmit}>
        <CallRecordingPanel leadId="lead-1" onDraft={onDraft} />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: /grabar con ia/i }));
    await user.click(screen.getByRole("checkbox", { name: /he informado al lead/i }));
    await user.click(screen.getByRole("button", { name: /iniciar grabación/i }));
    await user.click(
      screen.getByRole("button", { name: /detener y generar borrador/i }),
    );

    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(draft));
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.body).toBeInstanceOf(FormData);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cancels locally, releases the microphone and never uploads", async () => {
    const { stopTrack } = installRecordingEnvironment();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onDraft = vi.fn();
    const user = userEvent.setup();

    render(<CallRecordingPanel leadId="lead-1" onDraft={onDraft} />);

    await user.click(screen.getByRole("button", { name: /grabar con ia/i }));
    await user.click(screen.getByRole("checkbox", { name: /he informado al lead/i }));
    await user.click(screen.getByRole("button", { name: /iniciar grabación/i }));
    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /grabar con ia/i })).toBeVisible();
  });
});
