"use client";

import { useEffect, useRef, useState } from "react";
import type { CallFeedbackDraft, CloserCallFeedbackDraft, FeedbackRole } from "@crm-fran/api/call-feedback";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Field, FieldLabel } from "@crm-fran/ui/components/field";
import { MicIcon, SquareIcon, XIcon } from "lucide-react";

type RecordingState = "idle" | "ready" | "recording" | "processing";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_DURATION_MS = 120 * 60_000;

export function CallRecordingPanel({
  leadId,
  onDraft,
  feedbackRole = "caller",
}: {
  leadId: string;
  feedbackRole?: FeedbackRole;
  onDraft: (draft: CallFeedbackDraft | CloserCallFeedbackDraft) => void;
}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [leadWasInformed, setLeadWasInformed] = useState(false);
  const [error, setError] = useState<string>();
  const [coachingCreated, setCoachingCreated] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBytesRef = useRef(0);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const stopTimerRef = useRef<number | undefined>(undefined);

  const releaseMicrophone = () => {
    if (stopTimerRef.current !== undefined) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = undefined;
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      releaseMicrophone();
    };
  }, []);

  const reset = () => {
    chunksRef.current = [];
    recordedBytesRef.current = 0;
    setLeadWasInformed(false);
    setState("idle");
  };

  const uploadRecording = async (blob: Blob, durationMs: number) => {
    if (blob.size > MAX_AUDIO_BYTES || durationMs > MAX_DURATION_MS) throw new Error("La grabación supera el límite permitido");
    const formData = new FormData();
    const extension = blob.type.includes("ogg") ? "ogg" : "webm";
    formData.set("audio", new File([blob], `call.${extension}`, { type: blob.type }));
    formData.set("leadId", leadId);
    formData.set("durationMs", String(durationMs));
    formData.set("feedbackRole", feedbackRole);

    const response = await fetch("/api/call-feedback", {
      method: "POST",
      body: formData,
    });
    const body = (await response.json()) as {
      draft?: CallFeedbackDraft | CloserCallFeedbackDraft;
      coaching?: { id: string } | null;
      error?: string;
    };
    if (!response.ok || !body.draft) {
      throw new Error(body.error ?? "No se pudo procesar la grabación");
    }
    onDraft(body.draft);
    setCoachingCreated(Boolean(body.coaching?.id));
  };

  const startRecording = async () => {
    if (!leadWasInformed) return;
    setError(undefined);
    cancelledRef.current = false;
    chunksRef.current = [];
    recordedBytesRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        preferredType ? { mimeType: preferredType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size <= 0) return;
        recordedBytesRef.current += event.data.size;
        if (recordedBytesRef.current > MAX_AUDIO_BYTES) {
          cancelledRef.current = true;
          setError("La grabación supera el límite permitido");
          recorder.stop();
          return;
        }
        chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Math.round(performance.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        releaseMicrophone();
        if (cancelledRef.current) {
          reset();
          return;
        }
        setState("processing");
        void uploadRecording(blob, durationMs)
          .then(reset)
          .catch((reason: unknown) => {
            setError(
              reason instanceof Error
                ? reason.message
                : "No se pudo procesar la grabación",
            );
            reset();
          });
      };
      startedAtRef.current = performance.now();
      recorder.start(1_000);
      stopTimerRef.current = window.setTimeout(() => recorder.stop(), MAX_DURATION_MS);
      setState("recording");
    } catch {
      releaseMicrophone();
      setError("No se pudo acceder al micrófono");
      setState("ready");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      releaseMicrophone();
      reset();
    }
  };

  if (state === "idle") {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Feedback de la llamada</CardTitle>
          <CardDescription>
            Puedes completar el formulario sin grabar o generar un borrador con IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coachingCreated && <p className="mb-3 text-sm text-muted-foreground" role="status">Tu borrador privado de coaching está listo para revisarlo en Estadísticas personales.</p>}
          <Button type="button" variant="outline" onClick={() => setState("ready")}>
            <MicIcon data-icon="inline-start" />
            Grabar con IA
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          {state === "recording"
            ? "Grabando llamada"
            : state === "processing"
              ? "Generando borrador"
              : "Preparar grabación"}
        </CardTitle>
        <CardDescription>
          El audio y la transcripción no se guardan. La IA crea borradores estructurados de feedback y coaching para revisión humana.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state === "ready" && (
          <Field className="flex-row items-center">
            <Checkbox
              id="lead-recording-consent"
              checked={leadWasInformed}
              onCheckedChange={setLeadWasInformed}
            />
            <FieldLabel htmlFor="lead-recording-consent">
              He informado al lead de que la llamada será grabada
            </FieldLabel>
          </Field>
        )}

        {error && <p className="text-destructive" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {state === "ready" && (
            <Button type="button" disabled={!leadWasInformed} onClick={startRecording}>
              <MicIcon data-icon="inline-start" />
              Iniciar grabación
            </Button>
          )}
          {state === "recording" && (
            <Button type="button" onClick={stopRecording}>
              <SquareIcon data-icon="inline-start" />
              Detener y generar borrador
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={state === "processing"}
            onClick={cancelRecording}
          >
            <XIcon data-icon="inline-start" />
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
