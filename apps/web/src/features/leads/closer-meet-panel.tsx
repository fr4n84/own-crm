"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuitIcon, ExternalLinkIcon, FileTextIcon, VideoIcon, XIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Skeleton } from "@crm-fran/ui/components/skeleton";

import { trpc } from "@/utils/trpc";

const statusLabels: Record<string, string> = { scheduled: "Programada", recording_ready: "Grabación disponible", failed: "Error" };
const madridDateTimeFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

type TranscriptDetail = { sessionId: string; transcript: string; characterCount: number };

export function CloserMeetPanel({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const listOptions = trpc.closerMeet.list.queryOptions({ leadId });
  const meetingsQuery = useQuery(listOptions);
  const createMeeting = useMutation(trpc.closerMeet.create.mutationOptions());
  const analyzeTranscripts = useMutation(trpc.closerMeet.analyzeTranscripts.mutationOptions());
  const meetings = meetingsQuery.data ?? [];
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [submissionError, setSubmissionError] = useState<string>();
  const [transcriptDetail, setTranscriptDetail] = useState<TranscriptDetail>();
  const [transcriptLoadingId, setTranscriptLoadingId] = useState<string>();
  const [transcriptError, setTranscriptError] = useState<string>();
  const [analysisStatus, setAnalysisStatus] = useState<"created" | undefined>();
  const [analysisError, setAnalysisError] = useState<string>();

  const scheduleMeeting = async () => {
    const duration = Number(durationMinutes);
    if (scheduledDate === "" || scheduledTime === "" || !Number.isInteger(duration) || duration < 15 || duration > 480 || duration % 15 !== 0) {
      setSubmissionError("Indica fecha, hora y una duración válida en intervalos de 15 minutos.");
      return;
    }
    setSubmissionError(undefined);
    try {
      await createMeeting.mutateAsync({ operationId: crypto.randomUUID(), leadId, scheduledDate, scheduledTime, durationMinutes: duration });
      await queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
      setScheduledDate("");
      setScheduledTime("");
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "No se pudo programar la llamada.");
    }
  };

  const showTranscript = async (sessionId: string) => {
    const options = trpc.closerMeet.readTranscript.queryOptions({ sessionId });
    setTranscriptDetail(undefined);
    setTranscriptError(undefined);
    setTranscriptLoadingId(sessionId);
    try {
      const detail = await queryClient.fetchQuery(options);
      if (!detail) throw new Error("La transcripción almacenada no está disponible.");
      setTranscriptDetail(detail);
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : "No se pudo abrir la transcripción cifrada.");
    } finally {
      queryClient.removeQueries({ queryKey: options.queryKey, exact: true });
      setTranscriptLoadingId(undefined);
    }
  };

  const generateCoaching = async () => {
    setAnalysisError(undefined);
    setAnalysisStatus(undefined);
    try {
      await analyzeTranscripts.mutateAsync({ leadId });
      await queryClient.invalidateQueries({ queryKey: trpc.commercialCoaching.list.queryKey() });
      setAnalysisStatus("created");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "No se pudo generar el coaching privado.");
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Videollamadas de Google Meet</CardTitle>
        <CardDescription>Programa la llamada en horario de Madrid. El servidor comprueba que el lead esté asignado al Closer actual.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup className="md:grid md:grid-cols-3">
          <Field invalid={submissionError !== undefined && scheduledDate === ""}>
            <FieldLabel htmlFor={`closer-meet-date-${leadId}`}>Fecha de la llamada</FieldLabel>
            <Input id={`closer-meet-date-${leadId}`} type="date" value={scheduledDate} aria-invalid={submissionError !== undefined && scheduledDate === ""} onChange={(event) => setScheduledDate(event.target.value)} />
          </Field>
          <Field invalid={submissionError !== undefined && scheduledTime === ""}>
            <FieldLabel htmlFor={`closer-meet-time-${leadId}`}>Hora de la llamada</FieldLabel>
            <Input id={`closer-meet-time-${leadId}`} type="time" step={900} value={scheduledTime} aria-invalid={submissionError !== undefined && scheduledTime === ""} onChange={(event) => setScheduledTime(event.target.value)} />
          </Field>
          <Field invalid={submissionError !== undefined}>
            <FieldLabel htmlFor={`closer-meet-duration-${leadId}`}>Duración en minutos</FieldLabel>
            <Input id={`closer-meet-duration-${leadId}`} type="number" min={15} max={480} step={15} value={durationMinutes} aria-invalid={submissionError !== undefined} onChange={(event) => setDurationMinutes(event.target.value)} />
            <FieldDescription>Intervalos de 15 minutos.</FieldDescription>
          </Field>
        </FieldGroup>
        {submissionError && <FieldError role="alert">{submissionError}</FieldError>}
        <Button type="button" disabled={createMeeting.isPending} onClick={() => void scheduleMeeting()}>
          <VideoIcon data-icon="inline-start" />
          {createMeeting.isPending ? "Programando…" : "Programar Google Meet"}
        </Button>

        <section className="flex flex-col gap-3" aria-labelledby={`closer-meet-history-${leadId}`}>
          <h3 id={`closer-meet-history-${leadId}`} className="text-sm font-medium">Historial de llamadas</h3>
          {meetingsQuery.isLoading ? (
            <div className="flex flex-col gap-2" role="status"><span className="text-sm text-muted-foreground">Cargando llamadas…</span><Skeleton className="h-12 w-full" /></div>
          ) : meetingsQuery.error ? (
            <p className="text-sm text-destructive" role="alert">{meetingsQuery.error.message}</p>
          ) : meetings.length === 0 ? (
            <Empty heading="Todavía no hay llamadas programadas." description="La primera llamada aparecerá aquí después de programarla." />
          ) : (
            <ul className="flex flex-col gap-3">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="flex flex-col gap-2 border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{madridDateTimeFormatter.format(new Date(meeting.scheduledStart))}</span>
                    <Badge variant="secondary">{statusLabels[meeting.status] ?? meeting.status}</Badge>
                  </div>
                  {meeting.hasTranscript && <Badge variant="outline">Transcripción cifrada almacenada</Badge>}
                  <div className="flex flex-wrap gap-2">
                    {meeting.meetingUri && <Button variant="outline" size="sm" render={<a href={meeting.meetingUri} target="_blank" rel="noreferrer" />}>Abrir Meet<ExternalLinkIcon data-icon="inline-end" /></Button>}
                    {meeting.calendarEventUrl && <Button variant="outline" size="sm" render={<a href={meeting.calendarEventUrl} target="_blank" rel="noreferrer" />}>Abrir Calendar<ExternalLinkIcon data-icon="inline-end" /></Button>}
                    {meeting.status === "recording_ready" && meeting.driveExportUri && <Button variant="outline" size="sm" render={<a href={meeting.driveExportUri} target="_blank" rel="noreferrer" />}>Ver grabación<ExternalLinkIcon data-icon="inline-end" /></Button>}
                    {meeting.hasTranscript && <Button type="button" variant="outline" size="sm" disabled={transcriptLoadingId === meeting.id} onClick={() => void showTranscript(meeting.id)}><FileTextIcon data-icon="inline-start" />{transcriptLoadingId === meeting.id ? "Abriendo…" : "Ver transcripción"}</Button>}
                  </div>
                  {transcriptDetail?.sessionId === meeting.id && (
                    <Card size="sm">
                      <CardHeader><CardTitle>Transcripción privada</CardTitle><CardDescription>Visible solo en este detalle deliberado; no permanece en la caché de consultas.</CardDescription></CardHeader>
                      <CardContent><p className="whitespace-pre-wrap text-sm">{transcriptDetail.transcript}</p></CardContent>
                      <CardFooter><Button type="button" variant="outline" size="sm" onClick={() => setTranscriptDetail(undefined)}><XIcon data-icon="inline-start" />Cerrar transcripción</Button></CardFooter>
                    </Card>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {transcriptError && <p className="text-sm text-destructive" role="alert">{transcriptError}</p>}
        {meetings.some((meeting) => meeting.hasTranscript) && (
          <section className="flex flex-col gap-2" aria-labelledby={`closer-meet-coaching-${leadId}`}>
            <h3 id={`closer-meet-coaching-${leadId}`} className="text-sm font-medium">Coaching privado con IA</h3>
            <p className="text-xs text-muted-foreground">No se ejecuta automáticamente. Al solicitarlo, analiza como máximo cinco transcripciones y crea un borrador que debes confirmar o descartar.</p>
            <Button type="button" variant="outline" disabled={analyzeTranscripts.isPending} onClick={() => void generateCoaching()}><BrainCircuitIcon data-icon="inline-start" />{analyzeTranscripts.isPending ? "Generando…" : "Generar coaching con IA"}</Button>
            {analysisError && <p className="text-sm text-destructive" role="alert">{analysisError}</p>}
            {analysisStatus === "created" && <div className="flex flex-wrap items-center gap-2"><p className="text-sm">Borrador privado creado. Revísalo antes de confirmarlo.</p><Button size="sm" render={<a href="/estadisticas-personales#coaching-personal" />}>Revisar coaching privado</Button></div>}
          </section>
        )}
      </CardContent>
      <CardFooter><p className="text-xs text-muted-foreground">La llamada se graba y transcribe. El vídeo permanece en el Drive privado autorizado y la transcripción se almacena cifrada en el CRM con acceso restringido.</p></CardFooter>
    </Card>
  );
}