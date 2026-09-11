"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@crm-fran/ui/components/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Textarea } from "@crm-fran/ui/components/textarea";

import { trpc } from "@/utils/trpc";

export type WhatsappPreparationRow = {
  id: string;
  name: string;
  phone: string;
  consent: { id: string; status: "granted" | "revoked"; version: number } | null;
  outbox: {
    id: string;
    status: "pending_approval" | "approved" | "cancelled";
    bodyText: string;
    origin: "manual" | "ai";
    submittedById: string;
    submittedAt: string | Date;
    approvedById: string | null;
    approvedAt: string | Date | null;
  } | null;
};

function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function WhatsappMessagePreparation(props: {
  row: WhatsappPreparationRow;
  disabled: boolean;
  onUpdated: () => Promise<void>;
}) {
  const { row } = props;
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("consentimiento-verificado");
  const [evidence, setEvidence] = useState("");
  const [reference, setReference] = useState("");
  const [bodyText, setBodyText] = useState(row.outbox?.status === "pending_approval" ? row.outbox.bodyText : "");
  const [origin, setOrigin] = useState<"manual" | "ai">("manual");
  const [contextHash, setContextHash] = useState<string>();
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const recordConsent = useMutation(trpc.whatsapp.recordConsent.mutationOptions({
    onSuccess: async () => {
      toast.success("Consentimiento de WhatsApp registrado");
      setEvidence("");
      setReference("");
      await props.onUpdated();
    },
    onError: (error) => toast.error(error.message),
  }));
  const revokeConsent = useMutation(trpc.whatsapp.revokeConsent.mutationOptions({
    onSuccess: async () => {
      toast.success("Consentimiento de WhatsApp revocado");
      await props.onUpdated();
    },
    onError: (error) => toast.error(error.message),
  }));
  const generateDraft = useMutation(trpc.whatsapp.generateDraft.mutationOptions({
    onSuccess: (draft) => {
      setBodyText(draft.bodyText);
      setOrigin("ai");
      setContextHash(draft.contextHash);
      toast.success("Borrador IA listo para editar");
    },
    onError: (error) => toast.error(error.message),
  }));
  const submitForApproval = useMutation(trpc.whatsapp.submitForApproval.mutationOptions({
    onSuccess: async () => {
      toast.success("Mensaje enviado a aprobación; NO se ha enviado por WhatsApp");
      setIdempotencyKey(newIdempotencyKey());
      setOpen(false);
      await props.onUpdated();
    },
    onError: (error) => toast.error(error.message),
  }));
  const approveMessage = useMutation(trpc.whatsapp.approveMessage.mutationOptions({
    onSuccess: async () => {
      toast.success("Borrador aprobado; el proveedor sigue desactivado y NO se ha enviado");
      setOpen(false);
      await props.onUpdated();
    },
    onError: (error) => toast.error(error.message),
  }));
  const busy = recordConsent.isPending
    || revokeConsent.isPending
    || generateDraft.isPending
    || submitForApproval.isPending
    || approveMessage.isPending;
  const pendingMessage = row.outbox?.status === "pending_approval" ? row.outbox : null;

  function consentPayload() {
    return {
      leadId: row.id,
      source,
      evidence,
      ...(reference.trim() ? { reference } : {}),
      occurredAt: new Date().toISOString(),
    };
  }

  function submit() {
    submitForApproval.mutate({
      leadId: row.id,
      bodyText,
      origin,
      ...(origin === "ai" && contextHash ? { contextHash } : {}),
      idempotencyKey,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && setOpen(nextOpen)}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" disabled={props.disabled} />}>
        Preparar mensaje
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Preparar WhatsApp para {row.name}</DialogTitle>
          <DialogDescription>
            El CRM solo prepara y audita. Nunca envía automáticamente; la aprobación exige otra persona.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{row.phone}</Badge>
          <Badge variant={row.consent ? "secondary" : "outline"}>
            {row.consent ? `Consentimiento vigente v${row.consent.version}` : "Sin consentimiento vigente"}
          </Badge>
          {row.outbox ? <Badge variant="outline">{outboxLabel(row.outbox.status)}</Badge> : null}
        </div>

        {!row.consent ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`whatsapp-consent-source-${row.id}`}>Fuente del consentimiento</FieldLabel>
              <Input id={`whatsapp-consent-source-${row.id}`} value={source} onChange={(event) => setSource(event.target.value)} maxLength={120} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`whatsapp-consent-evidence-${row.id}`}>Evidencia verificable</FieldLabel>
              <Textarea id={`whatsapp-consent-evidence-${row.id}`} value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={2_000} />
              <FieldDescription>Tener teléfono o consentimiento de email NO autoriza WhatsApp.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`whatsapp-consent-reference-${row.id}`}>Referencia opcional</FieldLabel>
              <Input id={`whatsapp-consent-reference-${row.id}`} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={500} />
            </Field>
            <Button type="button" disabled={busy || !source.trim() || !evidence.trim()} onClick={() => recordConsent.mutate(consentPayload())}>
              <ShieldCheckIcon data-icon="inline-start" />
              Registrar consentimiento
            </Button>
          </FieldGroup>
        ) : pendingMessage ? (
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor={`whatsapp-pending-body-${row.id}`}>Borrador pendiente</FieldLabel>
              <Textarea id={`whatsapp-pending-body-${row.id}`} value={pendingMessage.bodyText} readOnly rows={7} />
              <FieldDescription>Comprueba destinatario y contenido. Quien lo preparó no puede aprobarlo.</FieldDescription>
            </Field>
            <Button type="button" disabled={busy} onClick={() => approveMessage.mutate({ messageId: pendingMessage.id })}>
              <CheckIcon data-icon="inline-start" />
              Aprobar borrador
            </Button>
          </div>
        ) : row.outbox?.status === "approved" ? (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="font-medium">Borrador aprobado</p>
            <p className="text-muted-foreground">No se ha enviado. La integración con el proveedor está desactivada.</p>
            <p className="whitespace-pre-wrap">{row.outbox.bodyText}</p>
          </div>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`whatsapp-message-${row.id}`}>Mensaje</FieldLabel>
              <Textarea id={`whatsapp-message-${row.id}`} value={bodyText} onChange={(event) => { setBodyText(event.target.value); if (origin === "ai") setIdempotencyKey(newIdempotencyKey()); }} maxLength={4_000} rows={7} />
              <FieldDescription>Edita el texto antes de solicitar la aprobación. Esta acción NO envía el mensaje.</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => generateDraft.mutate({ leadId: row.id })}>
                <SparklesIcon data-icon="inline-start" />
                {generateDraft.isPending ? "Preparando…" : "Crear borrador con IA"}
              </Button>
              <Button type="button" disabled={busy || !bodyText.trim()} onClick={submit}>
                Enviar a aprobación
              </Button>
            </div>
          </FieldGroup>
        )}

        {row.consent ? (
          <DialogFooter>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => {
              if (window.confirm("¿Revocar el consentimiento de WhatsApp? Los borradores pendientes se cancelarán.")) {
                revokeConsent.mutate({
                  leadId: row.id,
                  source: "revocación-verificada",
                  evidence: "Revocación confirmada por personal autorizado en el CRM",
                  occurredAt: new Date().toISOString(),
                });
              }
            }}>
              Revocar consentimiento
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function outboxLabel(status: WhatsappPreparationRow["outbox"] extends infer T ? T extends { status: infer S } ? S : never : never) {
  if (status === "pending_approval") return "Pendiente de aprobación";
  if (status === "approved") return "Aprobado · no enviado";
  return "Cancelado";
}
