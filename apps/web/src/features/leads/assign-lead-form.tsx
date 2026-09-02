"use client";

import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FEEDBACK_PROFILES,
  MOTIVATION_ANGLES,
  OBJECTION_TYPES,
  type CallFeedbackDraft,
  type FeedbackProfile,
  type MotivationAngle,
  type ObjectionType,
} from "@crm-fran/api/call-feedback";

import { trpc } from "@/utils/trpc";
import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { Field, FieldError, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Textarea } from "@crm-fran/ui/components/textarea";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { CallRecordingPanel } from "./call-recording-panel";
import { CALLER_FEEDBACK_OPTIONS } from "./caller-feedback";
import type { CallerOutcome } from "@crm-fran/api/caller-outcome";

type AlertSeverity = "urgent" | "warning" | "info";
type ContactStatus = "" | "Si" | "No" | "Numero no existe";

type FormValue = {
  isContacted: ContactStatus;
  outcome: CallerOutcome | "";
  primaryProfile: FeedbackProfile | "";
  subProfile: FeedbackProfile | "";
  motivationAngles: MotivationAngle[];
  objectionTypes: ObjectionType[];
  isDecisionMaker: string;
  decisionMakerName: string;
  financialSource: string;
  trainingAndPriceAwareness: string;
  urgencyReason: string;
  summary: string;
  extraInfo: string;
  closerId: string;
  scheduledDate: string;
  scheduledTime: string;
  alertSeverity: AlertSeverity | "";
};

type LeadQuestion = {
  questionKey?: string;
  question?: string;
  answer: string;
  authorRole: "caller" | "closer";
  authorId?: string | null;
};

interface AssignLeadFormProps {
  leadId: string;
  onCancel?: () => void;
  onSuccess?: (result: { leadId: string; alertId?: string }) => void;
  leadQuestions?: readonly LeadQuestion[];
  currentCloserId?: string | null;
  onSubmitLabelChange?: (label: string) => void;
  freshEvent?: boolean;
  appointmentOutcomeLabel?: "Agenda" | "Reagenda";
  formId?: string;
  sourceAlertId?: string;
  allowedOutcomes?: CallerOutcome[];
}

const OUTCOME_OPTIONS = CALLER_FEEDBACK_OPTIONS;

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string }[] = [
  { value: "urgent", label: "Alta" },
  { value: "warning", label: "Media" },
  { value: "info", label: "Baja" },
];

const OUTCOME_BY_LABEL = Object.fromEntries(
  CALLER_FEEDBACK_OPTIONS.map(({ value, label }) => [label, value]),
) as Record<string, CallerOutcome>;

const defaultValues: FormValue = {
  isContacted: "",
  outcome: "",
  primaryProfile: "",
  subProfile: "",
  motivationAngles: [],
  objectionTypes: [],
  isDecisionMaker: "",
  decisionMakerName: "",
  financialSource: "",
  trainingAndPriceAwareness: "",
  urgencyReason: "",
  summary: "",
  extraInfo: "",
  closerId: "",
  scheduledDate: "",
  scheduledTime: "",
  alertSeverity: "",
};

function getInitialValues(
  leadQuestions: readonly LeadQuestion[] | undefined,
): FormValue {
  const callerQuestions = (leadQuestions ?? []).filter(
    (question) => question.authorRole === "caller",
  );
  const byKey = new Map(
    callerQuestions
      .filter((question) => question.questionKey)
      .map((question) => [question.questionKey, question.answer]),
  );
  const outcomeAnswer = byKey.get("callerOutcome");
  const outcome = outcomeAnswer ? OUTCOME_BY_LABEL[outcomeAnswer] ?? "" : "";
  const severity = byKey.get("alertSeverity");
  const legacyContacted = byKey.get("isContacted");
  const phoneStatus = byKey.get("phoneStatus");
  const primaryProfileAnswer = byKey.get("primaryProfile");
  const subProfileAnswer = byKey.get("subProfile");
  const isFeedbackProfile = (value: string | undefined): value is FeedbackProfile =>
    Boolean(value && FEEDBACK_PROFILES.some((profile) => profile.value === value));
  let motivationAngles: MotivationAngle[] = [];
  let objectionTypes: ObjectionType[] = [];
  try {
    const parsed: unknown = JSON.parse(byKey.get("motivationAngles") ?? "[]");
    if (Array.isArray(parsed)) {
      motivationAngles = parsed.filter(
        (value): value is MotivationAngle =>
          typeof value === "string" &&
          MOTIVATION_ANGLES.some((angle) => angle.value === value),
      );
    }
  } catch {
    motivationAngles = [];
  }
  try {
    const parsed: unknown = JSON.parse(byKey.get("objectionTypes") ?? "[]");
    if (Array.isArray(parsed)) objectionTypes = parsed.filter((value): value is ObjectionType => typeof value === "string" && OBJECTION_TYPES.some((item) => item.value === value));
  } catch { objectionTypes = []; }

  return {
    isContacted:
      phoneStatus === "Número no existe"
        ? "Numero no existe"
        : outcome || legacyContacted === "Si"
        ? "Si"
        : legacyContacted === "No"
          ? "No"
          : "",
    outcome,
    primaryProfile: isFeedbackProfile(primaryProfileAnswer) ? primaryProfileAnswer : "",
    subProfile: isFeedbackProfile(subProfileAnswer) ? subProfileAnswer : "",
    motivationAngles,
    objectionTypes,
    isDecisionMaker: byKey.get("isDecisionMaker") ?? "",
    decisionMakerName: byKey.get("decisionMakerName") ?? "",
    financialSource: byKey.get("financialSource") ?? "",
    trainingAndPriceAwareness:
      byKey.get("trainingAndPriceAwareness") ?? byKey.get("productFit") ?? "",
    urgencyReason: byKey.get("urgencyReason") ?? "",
    summary: byKey.get("summary") ?? "",
    extraInfo: byKey.get("extraInfo") ?? "",
    closerId: byKey.get("closerId") ?? "",
    scheduledDate: byKey.get("scheduledDate") ?? "",
    scheduledTime: byKey.get("scheduledTime") ?? "",
    alertSeverity:
      severity === "urgent" || severity === "warning" || severity === "info"
        ? severity
        : "",
  };
}

function validateForm(value: FormValue) {
  const fields: Record<string, string[]> = {};

  if (!value.isContacted) {
    fields.isContacted = ["Seleccione una opción"];
    return { fields };
  }

  if (value.isContacted === "No" || value.isContacted === "Numero no existe") {
    return undefined;
  }

  if (!value.outcome) {
    fields.outcome = ["Seleccione qué ha sucedido"];
  }

  if (value.outcome === "future_call") {
    if (!value.scheduledDate) fields.scheduledDate = ["Requerido"];
    if (!value.scheduledTime) fields.scheduledTime = ["Requerido"];
    if (!value.alertSeverity) fields.alertSeverity = ["Seleccione una importancia"];
  }

  if (value.outcome === "appointment") {
    if (!value.closerId) fields.closerId = ["Seleccione un closer"];
    if (!value.scheduledDate) fields.scheduledDate = ["Requerido"];
    if (!value.scheduledTime) fields.scheduledTime = ["Requerido"];
  }

  if (
    (value.outcome === "future_call" || value.outcome === "appointment") &&
    value.scheduledDate &&
    value.scheduledTime &&
    new Date(`${value.scheduledDate}T${value.scheduledTime}`).getTime() <= Date.now()
  ) {
    fields.scheduledDate = ["La fecha y hora deben ser futuras"];
  }

  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

function buildPayload(value: FormValue, leadId: string, sourceAlertId?: string) {
  const sourceAlert = sourceAlertId ? { sourceAlertId } : {};

  if (value.isContacted === "Numero no existe") {
    return {
      leadId,
      ...sourceAlert,
      isContacted: "No" as const,
      phoneStatus: "invalid" as const,
    };
  }

  if (value.isContacted === "No") {
    return { leadId, ...sourceAlert, isContacted: "No" as const };
  }

  const questions = [
    ["primaryProfile", "Perfil principal", value.primaryProfile],
    ["subProfile", "Subperfil", value.subProfile],
    ["motivationAngles", "Ángulos de motivación", JSON.stringify(value.motivationAngles)],
    ["objectionTypes", "Objeciones confirmadas", JSON.stringify(value.objectionTypes)],
    ["isContacted", "¿Fue contactado?", "Si"],
    ["isDecisionMaker", "¿Es el decisor?", value.isDecisionMaker],
    ["decisionMakerName", "¿Quién es la persona correcta?", value.decisionMakerName],
    ["financialSource", "¿De dónde sale su capacidad económica?", value.financialSource],
    [
      "trainingAndPriceAwareness",
      "¿Es consciente de que es una formación y sabe el precio?",
      value.trainingAndPriceAwareness,
    ],
    ["urgencyReason", "¿De dónde sale la urgencia?", value.urgencyReason],
    ["summary", "Resumen de la llamada", value.summary],
    ["extraInfo", "Información extra", value.extraInfo],
  ]
    .filter(([questionKey, , answer]) =>
      questionKey === "motivationAngles" || questionKey === "objectionTypes" ? answer !== "[]" : answer.trim() !== "",
    )
    .map(([questionKey, question, answer]) => ({
      questionKey,
      question,
      answer,
    }));

  if (value.outcome === "future_call") {
    return {
      leadId,
      ...sourceAlert,
      isContacted: "Si" as const,
      outcome: value.outcome,
      questions,
      scheduledDate: value.scheduledDate,
      scheduledTime: value.scheduledTime,
      alertSeverity: value.alertSeverity as AlertSeverity,
    };
  }

  if (value.outcome === "appointment") {
    return {
      leadId,
      ...sourceAlert,
      isContacted: "Si" as const,
      outcome: value.outcome,
      questions,
      closerId: value.closerId,
      scheduledDate: value.scheduledDate,
      scheduledTime: value.scheduledTime,
    };
  }

  return {
    leadId,
    ...sourceAlert,
    isContacted: "Si" as const,
    outcome: value.outcome as "not_fit" | "not_interested",
    questions,
  };
}

export default function AssignLeadForm({
  leadId,
  onSuccess,
  leadQuestions,
  currentCloserId,
  onSubmitLabelChange,
  freshEvent = false,
  appointmentOutcomeLabel = "Agenda",
  formId = "assign-lead-form",
  sourceAlertId,
  allowedOutcomes,
}: AssignLeadFormProps) {
  const queryClient = useQueryClient();
  const initialValues = freshEvent
    ? {
        ...defaultValues,
        isContacted: "Si" as const,
        closerId: currentCloserId ?? "",
      }
    : getInitialValues(leadQuestions);
  const outcomeOptions = OUTCOME_OPTIONS
    .filter(
      (option) => !allowedOutcomes || allowedOutcomes.includes(option.value),
    )
    .map((option) =>
      option.value === "appointment"
        ? { ...option, label: appointmentOutcomeLabel }
        : option,
    );
  const [isContacted, setIsContacted] = useState<ContactStatus>(
    initialValues.isContacted,
  );
  const [outcome, setOutcome] = useState<CallerOutcome | "">(
    initialValues.outcome,
  );
  const closers = useQuery(trpc.users.listClosers.queryOptions());
  const mutation = useTrpcMutationWithToast(
    trpc.leads.assignLead.mutationOptions(),
    {
      success: initialValues.outcome
        ? "Información editada correctamente"
        : "Información guardada correctamente",
      error: "Error al guardar la información",
    },
  );

  useEffect(() => {
    onSubmitLabelChange?.(initialValues.outcome ? "Editar" : "Guardar");
  }, [initialValues.outcome, onSubmitLabelChange]);

  const form = useForm({
    defaultValues: initialValues ?? defaultValues,
    validators: {
      onSubmit: ({ value }) => validateForm(value),
    },
    onSubmit: async ({ value }) => {
      mutation.mutate(buildPayload(value, leadId, sourceAlertId), {
        onSuccess: (result) => {
          onSuccess?.(result);
          queryClient.invalidateQueries({
            queryKey: trpc.leads.listByUserId.queryKey(),
          });
        },
      });
    },
  });

  const clearConditionalFields = () => {
    form.setFieldValue("outcome", "");
    form.setFieldValue("closerId", "");
    form.setFieldValue("scheduledDate", "");
    form.setFieldValue("scheduledTime", "");
    form.setFieldValue("alertSeverity", "");
  };

  const clearPreviousQuestions = () => {
    form.setFieldValue("primaryProfile", "");
    form.setFieldValue("subProfile", "");
    form.setFieldValue("motivationAngles", []);
    form.setFieldValue("objectionTypes", []);
    form.setFieldValue("isDecisionMaker", "");
    form.setFieldValue("decisionMakerName", "");
    form.setFieldValue("financialSource", "");
    form.setFieldValue("trainingAndPriceAwareness", "");
    form.setFieldValue("urgencyReason", "");
    form.setFieldValue("summary", "");
    form.setFieldValue("extraInfo", "");
  };

  const handleContactedChange = (value: string) => {
    clearConditionalFields();
    clearPreviousQuestions();
    const nextValue: ContactStatus =
      value === "Si" || value === "No" || value === "Numero no existe"
        ? value
        : "";
    setIsContacted(nextValue);
    setOutcome("");
    form.setFieldValue("isContacted", nextValue);
  };

  const handleOutcomeChange = (value: string) => {
    clearConditionalFields();
    const nextOutcome = outcomeOptions.some((option) => option.value === value)
      ? (value as CallerOutcome)
      : "";
    setOutcome(nextOutcome);
    form.setFieldValue("outcome", nextOutcome);
  };

  const applyAiDraft = (draft: CallFeedbackDraft) => {
    const nextOutcome = outcomeOptions.some(
      (option) => option.value === draft.outcome,
    )
      ? draft.outcome
      : "";
    const nextContacted = draft.isContacted;

    setIsContacted(nextContacted);
    setOutcome(nextContacted === "Si" ? nextOutcome : "");
    form.setFieldValue("isContacted", nextContacted);
    form.setFieldValue("outcome", nextContacted === "Si" ? nextOutcome : "");
    form.setFieldValue("primaryProfile", draft.primaryProfile);
    form.setFieldValue(
      "subProfile",
      draft.primaryProfile === "latino_extranjero" ? draft.subProfile : "",
    );
    form.setFieldValue("motivationAngles", draft.motivationAngles);
    form.setFieldValue("objectionTypes", draft.objectionTypes);
    form.setFieldValue("isDecisionMaker", draft.isDecisionMaker);
    form.setFieldValue("decisionMakerName", draft.decisionMakerName);
    form.setFieldValue("financialSource", draft.financialSource);
    form.setFieldValue(
      "trainingAndPriceAwareness",
      draft.trainingAndPriceAwareness,
    );
    form.setFieldValue("urgencyReason", draft.urgencyReason);
    form.setFieldValue("summary", draft.summary);
    form.setFieldValue("extraInfo", draft.extraInfo);
    form.setFieldValue("scheduledDate", draft.scheduledDate);
    form.setFieldValue("scheduledTime", draft.scheduledTime);
    form.setFieldValue("alertSeverity", draft.alertSeverity);
    form.setFieldValue(
      "closerId",
      nextOutcome === "appointment" ? currentCloserId ?? "" : "",
    );
  };

  return (
    <form
      className="mx-auto w-full max-w-lg"
      id={formId}
      data-testid="assign-lead-form"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <CallRecordingPanel leadId={leadId} onDraft={applyAiDraft} />

        <form.Field name="isContacted">
          {(field) => (
            <Field invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="isContacted">¿Fue contactado?</FieldLabel>
              <Select
                value={field.state.value}
                onValueChange={(value) => handleContactedChange(value ?? "")}
              >
                <SelectTrigger
                  id="isContacted"
                  data-testid="isContacted-trigger"
                >
                  <SelectValue placeholder="Seleccione una opción" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Si">Si</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Numero no existe">
                      Número no existe
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>
                {field.state.meta.errors
                  .map((error) => (typeof error === "string" ? error : ""))
                  .join(" ")}
              </FieldError>
            </Field>
          )}
        </form.Field>

        {isContacted === "Si" && (
          <>
        <form.Field name="outcome">
          {(field) => (
            <Field invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="outcome">¿Qué ha sucedido?</FieldLabel>
              <Select
                value={field.state.value}
                onValueChange={(value) => handleOutcomeChange(value ?? "")}
              >
                <SelectTrigger id="outcome" data-testid="outcome-trigger">
                  <SelectValue>
                    {outcomeOptions.find(
                      (option) => option.value === field.state.value,
                    )?.label ?? "Seleccione una opción"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {outcomeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>
                {field.state.meta.errors
                  .map((error) => (typeof error === "string" ? error : ""))
                  .join(" ")}
              </FieldError>
            </Field>
          )}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="primaryProfile">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="primaryProfile">Perfil principal</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => {
                    const nextValue = (value ?? "") as FeedbackProfile | "";
                    field.handleChange(nextValue);
                    if (nextValue !== "latino_extranjero") {
                      form.setFieldValue("subProfile", "");
                    }
                  }}
                >
                  <SelectTrigger id="primaryProfile" data-testid="primary-profile-trigger">
                    <SelectValue placeholder="Seleccione un perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {FEEDBACK_PROFILES.map((profile) => (
                        <SelectItem key={profile.value} value={profile.value}>
                          {profile.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.primaryProfile}>
            {(primaryProfile) =>
              primaryProfile === "latino_extranjero" ? (
                <form.Field name="subProfile">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="subProfile">Subperfil</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange((value ?? "") as FeedbackProfile | "")}
                      >
                        <SelectTrigger id="subProfile" data-testid="sub-profile-trigger">
                          <SelectValue placeholder="Seleccione un subperfil" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {FEEDBACK_PROFILES.filter((profile) => profile.value !== "latino_extranjero").map((profile) => (
                              <SelectItem key={profile.value} value={profile.value}>
                                {profile.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
              ) : null
            }
          </form.Subscribe>
        </div>

        <form.Field name="motivationAngles">
          {(field) => (
            <Field>
              <FieldLabel>Ángulos de motivación</FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                {MOTIVATION_ANGLES.map((angle) => {
                  const checked = field.state.value.includes(angle.value);
                  return (
                    <label key={angle.value} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) =>
                          field.handleChange(
                            nextChecked
                              ? [...field.state.value, angle.value]
                              : field.state.value.filter((value) => value !== angle.value),
                          )
                        }
                      />
                      <span>{angle.label}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
          )}
        </form.Field>

        <form.Field name="objectionTypes">
          {(field) => (
            <Field>
              <FieldLabel>Objeciones confirmadas</FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                {OBJECTION_TYPES.map((item) => {
                  const checked = field.state.value.includes(item.value);
                  return <label key={item.value} className="flex items-start gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={(next) => field.handleChange(next ? [...field.state.value, item.value] : field.state.value.filter((value) => value !== item.value))} /><span>{item.label}</span></label>;
                })}
              </div>
              <p className="text-xs text-muted-foreground">Las sugerencias de IA no se guardan hasta que una persona revise y guarde este formulario.</p>
            </Field>
          )}
        </form.Field>

        <div className="flex flex-col gap-4">
          <form.Field name="isDecisionMaker">
            {(field) => (
              <Field invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="isDecisionMaker">¿Es el decisor?</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value ?? "")}
                >
                  <SelectTrigger id="isDecisionMaker">
                    <SelectValue placeholder="Seleccione una opción" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="Si">Si</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError>
                  {field.state.meta.errors
                    .map((error) => (typeof error === "string" ? error : ""))
                    .join(" ")}
                </FieldError>
              </Field>
            )}
          </form.Field>

          <form.Field name="decisionMakerName">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="decisionMakerName">
                  Si respondió NO ¿quién es la persona correcta?
                </FieldLabel>
                <Input
                  id="decisionMakerName"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="financialSource">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="financialSource">
                  ¿De dónde sale su capacidad económica?
                </FieldLabel>
                <Input
                  id="financialSource"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="trainingAndPriceAwareness">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="trainingAndPriceAwareness">
                  ¿Es consciente de que es una formación y sabe el precio?
                </FieldLabel>
                <Input
                  id="trainingAndPriceAwareness"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="urgencyReason">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="urgencyReason">
                  ¿De dónde sale la urgencia?
                </FieldLabel>
                <Input
                  id="urgencyReason"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="summary">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="summary">Resumen de la llamada</FieldLabel>
                <Textarea
                  id="summary"
                  rows={4}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="extraInfo">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="extraInfo">Información extra</FieldLabel>
                <Textarea
                  id="extraInfo"
                  rows={12}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>
        </div>

        {outcome === "future_call" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="scheduledDate">
                {(field) => (
                  <Field invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="scheduledDate">Fecha</FieldLabel>
                    <Input
                      id="scheduledDate"
                      type="date"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError>
                      {field.state.meta.errors
                        .map((error) => (typeof error === "string" ? error : ""))
                        .join(" ")}
                    </FieldError>
                  </Field>
                )}
              </form.Field>

              <form.Field name="scheduledTime">
                {(field) => (
                  <Field invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="scheduledTime">Hora</FieldLabel>
                    <Input
                      id="scheduledTime"
                      type="time"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError>
                      {field.state.meta.errors
                        .map((error) => (typeof error === "string" ? error : ""))
                        .join(" ")}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            </div>

            <form.Field name="alertSeverity">
              {(field) => (
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="alertSeverity">Importancia de la alerta</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value ?? "")}
                  >
                    <SelectTrigger id="alertSeverity">
                      <SelectValue placeholder="Seleccione una importancia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {SEVERITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>
                    {field.state.meta.errors
                      .map((error) => (typeof error === "string" ? error : ""))
                      .join(" ")}
                  </FieldError>
                </Field>
              )}
            </form.Field>
          </>
        )}

        {outcome === "appointment" && (
          <>
            <form.Field name="closerId">
              {(field) => (
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="closerId">Closer asignado</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value ?? "")}
                  >
                    <SelectTrigger id="closerId">
                      <SelectValue placeholder="Seleccione un closer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {closers.isLoading ? (
                          <Skeleton className="h-8 w-full" />
                        ) : (
                          closers.data?.map((closer) => (
                            <SelectItem key={closer.id} value={closer.id}>
                              {closer.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>
                    {field.state.meta.errors
                      .map((error) => (typeof error === "string" ? error : ""))
                      .join(" ")}
                  </FieldError>
                </Field>
              )}
            </form.Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="scheduledDate">
                {(field) => (
                  <Field invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="scheduledDate">Fecha</FieldLabel>
                    <Input
                      id="scheduledDate"
                      type="date"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError>
                      {field.state.meta.errors
                        .map((error) => (typeof error === "string" ? error : ""))
                        .join(" ")}
                    </FieldError>
                  </Field>
                )}
              </form.Field>

              <form.Field name="scheduledTime">
                {(field) => (
                  <Field invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="scheduledTime">Hora</FieldLabel>
                    <Input
                      id="scheduledTime"
                      type="time"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError>
                      {field.state.meta.errors
                        .map((error) => (typeof error === "string" ? error : ""))
                        .join(" ")}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            </div>
          </>
        )}
          </>
        )}
      </FieldGroup>
    </form>
  );
}
