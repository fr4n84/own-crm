"use client";

import { useState, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { QASessionItem } from "@/app/types";
import { trpc } from "@/utils/trpc";
import { requiresScheduledContact } from "./closer-follow-up";
import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { Input } from "@crm-fran/ui/components/input";
import { Textarea } from "@crm-fran/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from "@crm-fran/ui/components/field";

const formSchema = z.object({
  isContacted: z.string(),
  isDecisionMaker: z.string(),
  decisionMakerName: z.string(),
  financialSource: z.string(),
  productFit: z.string(),
  urgencyReason: z.string(),
  extraInfo: z.string(),
  closerOutcome: z.string(),
  closerFeedback: z.string(),
  scheduledDate: z.string(),
  scheduledTime: z.string(),
});

type FormValue = z.infer<typeof formSchema>;

const defaultValues = {
  isContacted: "",
  isDecisionMaker: "",
  decisionMakerName: "",
  financialSource: "",
  productFit: "",
  urgencyReason: "",
  extraInfo: "",
  closerOutcome: "",
  closerFeedback: "",
  scheduledDate: "",
  scheduledTime: "",
};

type FieldName = keyof typeof defaultValues;

const conditionalFieldNames: FieldName[] = [
  "isDecisionMaker",
  "decisionMakerName",
  "financialSource",
  "productFit",
  "urgencyReason",
  "scheduledDate",
  "scheduledTime",
  "extraInfo",
  "closerOutcome",
];

interface CloserQAFormProps {
  leadId: string;
  leadQuestions: QASessionItem[];
  currentCloserId?: string | null;
  onCancel?: () => void;
  onSuccess?: () => void;
  onSubmitLabelChange?: (label: string) => void;
}

export default function CloserQAForm({
  leadId,
  leadQuestions,
  currentCloserId,
  onSuccess,
  onSubmitLabelChange,
}: CloserQAFormProps) {
  const queryClient = useQueryClient();
    const closerAnswers = leadQuestions.filter(
      (q) => q.authorRole === "closer",
    );
    const hasCloserAnswers = closerAnswers.length > 0;

  const parsedDefaults = closerAnswers.reduce(
    (acc, q) => {
      if (q.questionKey && q.questionKey in defaultValues) {
        acc[q.questionKey as FieldName] = q.answer;
      }
      return acc;
    },
    { ...defaultValues },
  );

   const [branch, setBranch] = useState<"" | "Si" | "No">(
     () => (parsedDefaults.isContacted as "" | "Si" | "No") || "",
   );
  const [closerOutcome, setCloserOutcome] = useState(
    () => parsedDefaults.closerOutcome,
  );

  const toastMessages = hasCloserAnswers
    ? {
        success: "Respuestas editadas correctamente",
        error: "Error al editar las respuestas",
      }
    : {
        success: "Respuestas guardadas correctamente",
        error: "Error al guardar las respuestas",
      };

  const submitLabel = hasCloserAnswers ? "Editar" : "Guardar";
  useEffect(() => {
    onSubmitLabelChange?.(submitLabel);
  }, [submitLabel, onSubmitLabelChange]);

  const mutation = useTrpcMutationWithToast(
    trpc.leads.recordCloserAnswers.mutationOptions(),
    toastMessages,
  );
  const rescheduleMutation = useTrpcMutationWithToast(
    trpc.leads.assignLead.mutationOptions(),
    {
      success: "Reagenda guardada correctamente",
      error: "Error al guardar la reagenda",
    },
  );

  const form = useForm({
    defaultValues: parsedDefaults,
    validators: {
      onSubmit: ({ value }) => {
        const result = validateCloserAnswers(value as FormValue);
        return result;
      },
    },
    onSubmit: async ({ value }) => {
      const payload = buildPayload(leadId, value as FormValue);
      const mutationOptions = {
        onSuccess: () => {
          onSuccess?.();
          queryClient.invalidateQueries({
            queryKey: trpc.leads.listByUserId.queryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.leads.listAll.queryKey(),
          });
        },
      };

      if (
        value.closerOutcome === "Reagenda" &&
        payload.isContacted === "Si" &&
        currentCloserId
      ) {
        rescheduleMutation.mutate(
          {
            leadId,
            isContacted: "Si",
            outcome: "appointment",
            closerId: currentCloserId,
            scheduledDate: value.scheduledDate,
            scheduledTime: value.scheduledTime,
            questions: payload.questions,
          },
          mutationOptions,
        );
        return;
      }

      mutation.mutate(payload, mutationOptions);
    },
  });

  const resetConditionalFields = () => {
    for (const name of conditionalFieldNames) {
      form.setFieldValue(name, "");
    }
  };

  const handleCloserOutcomeChange = (value: string) => {
    resetConditionalFields();
    setCloserOutcome(value);
    form.setFieldValue("closerOutcome", value);

    if (value === "No-show") {
      setBranch("No");
      form.setFieldValue("isContacted", "No");
      return;
    }

    setBranch("Si");
    form.setFieldValue("isContacted", "Si");
  };

  return (
    <form
      className="mx-auto w-full max-w-lg"
      id="closer-qa-form"
      data-testid="closer-qa-form"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="closerOutcome">
          {(field) => (
            <Field invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="closerOutcome">¿Qué ha ocurrido?</FieldLabel>
              <Select
                value={field.state.value}
                onValueChange={(value) =>
                  handleCloserOutcomeChange(value ?? "")
                }
              >
                <SelectTrigger
                  id="closerOutcome"
                  aria-invalid={field.state.meta.errors.length > 0}
                >
                  <SelectValue placeholder="Seleccione un resultado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Agenda">Agenda</SelectItem>
                    <SelectItem value="Reagenda">Reagenda</SelectItem>
                    <SelectItem value="Seguimiento">Seguimiento</SelectItem>
                    <SelectItem value="Venta">Venta</SelectItem>
                    <SelectItem value="No interesado">No interesado</SelectItem>
                    <SelectItem value="No-show">No-show</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>
                {field.state.meta.errors
                  .map((error) =>
                    typeof error === "string" ? error : "",
                  )
                  .join(" ")}
              </FieldError>
            </Field>
          )}
        </form.Field>

        {branch === "No" && (
          <form.Field name="closerFeedback">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="closerFeedback">
                  Feedback del closer
                </FieldLabel>
                <Textarea
                  id="closerFeedback"
                  value={field.state.value}
                  className="min-h-24 resize-none"
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>
        )}

        {branch === "Si" && (
          <>
            <form.Field name="closerFeedback">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="closerFeedback">
                    Feedback del closer
                  </FieldLabel>
                  <Textarea
                    id="closerFeedback"
                    value={field.state.value}
                    className="min-h-24 resize-none"
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="isDecisionMaker">
              {(field) => (
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="isDecisionMaker">
                    ¿Es el decisor?
                  </FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value ?? "")}
                  >
                    <SelectTrigger id="isDecisionMaker" className="h-11">
                      <SelectValue placeholder="Seleccione una opción" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Si">Si</SelectItem>
                      <SelectItem value="No">No</SelectItem>
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
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="decisionMakerName">
                    Si respondió NO ¿quién es la persona correcta?
                  </FieldLabel>
                  <Input
                    id="decisionMakerName"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
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

            <form.Field name="financialSource">
              {(field) => (
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="financialSource">
                    ¿De dónde sale su capacidad económica?
                  </FieldLabel>
                  <Textarea
                    id="financialSource"
                    value={field.state.value}
                    className="min-h-28 resize-none"
                    onChange={(e) => field.handleChange(e.target.value)}
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

            <form.Field name="productFit">
              {(field) => (
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="productFit">
                    Producto recomendado
                  </FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value ?? "")}
                  >
                    <SelectTrigger id="productFit">
                      <SelectValue placeholder="Seleccione un producto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Product 1">Product 1</SelectItem>
                      <SelectItem value="Product 2">Product 2</SelectItem>
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

            <form.Field name="urgencyReason">
              {(field) => (
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="urgencyReason">
                    ¿De dónde sale la urgencia?
                  </FieldLabel>
                  <Textarea
                    id="urgencyReason"
                    value={field.state.value}
                    className="min-h-28 resize-none"
                    onChange={(e) => field.handleChange(e.target.value)}
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

            <form.Field name="extraInfo">
              {(field) => (
                <Field invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="extraInfo">Información extra</FieldLabel>
                  <Textarea
                    id="extraInfo"
                    value={field.state.value}
                    className="min-h-28 resize-none"
                    onChange={(e) => field.handleChange(e.target.value)}
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

            {requiresScheduledContact(closerOutcome) && (
            <div className="grid grid-cols-2 gap-4">
              <form.Field name="scheduledDate">
                {(field) => (
                  <Field invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="scheduledDate">
                      {closerOutcome === "Seguimiento"
                        ? "Fecha del próximo contacto"
                        : "Fecha"}
                    </FieldLabel>
                    <Input
                      id="scheduledDate"
                      type="date"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError>
                      {field.state.meta.errors
                        .map((error) =>
                          typeof error === "string" ? error : "",
                        )
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError>
                      {field.state.meta.errors
                        .map((error) =>
                          typeof error === "string" ? error : "",
                        )
                        .join(" ")}
                    </FieldError>
                  </Field>
                )}
              </form.Field>
            </div>
            )}
          </>
        )}
      </FieldGroup>
    </form>
  );
}

function validateCloserAnswers(value: FormValue) {
  const fieldErrors: Record<string, string[]> = {};

  if (value.closerOutcome === "") {
    fieldErrors.closerOutcome = ["Seleccione un resultado"];
  }

  if (value.isContacted === "Si") {
    if (value.isDecisionMaker === "") {
      fieldErrors.isDecisionMaker = ["Seleccione una opción"];
    }
    if (value.decisionMakerName.trim() === "") {
      fieldErrors.decisionMakerName = ["Requerido"];
    }
    if (value.financialSource.trim() === "") {
      fieldErrors.financialSource = ["Requerido"];
    }
    if (value.productFit.trim() === "") {
      fieldErrors.productFit = ["Requerido"];
    }
    if (value.urgencyReason.trim() === "") {
      fieldErrors.urgencyReason = ["Requerido"];
    }

    if (requiresScheduledContact(value.closerOutcome) && value.scheduledDate === "") {
      fieldErrors.scheduledDate = ["Requerido"];
    }
    if (requiresScheduledContact(value.closerOutcome) && value.scheduledTime === "") {
      fieldErrors.scheduledTime = ["Requerido"];
    }
  }

  return Object.keys(fieldErrors).length > 0
    ? { fields: fieldErrors }
    : undefined;
}

function buildPayload(
  leadId: string,
  value: FormValue,
):
  | {
      leadId: string;
      isContacted: "No";
      questions: { questionKey: string; question: string; answer: string }[];
    }
  | {
      leadId: string;
      isContacted: "Si";
      questions: { questionKey: string; question: string; answer: string }[];
      scheduledDate?: string;
      scheduledTime?: string;
      extraNotes: string;
    } {
  if (value.isContacted === "No") {
    const questions = [
      {
        questionKey: "isContacted",
        question: "¿Fue contactado?",
        answer: "No",
      },
      {
        questionKey: "closerOutcome",
        question: "Resultado de la agenda",
        answer: "No-show",
      },
    ];
    if (value.closerFeedback.trim() !== "") {
      questions.push({
        questionKey: "closerFeedback",
        question: "Feedback del closer",
        answer: value.closerFeedback,
      });
    }
    return { leadId, isContacted: "No", questions };
  }

  const questions = [
    {
      questionKey: "isContacted",
      question: "¿Fué contactado?",
      answer: "Si",
    },
    {
      questionKey: "closerOutcome",
      question: "Resultado de la agenda",
      answer: value.closerOutcome,
    },
    {
      questionKey: "isDecisionMaker",
      question: "¿Es el decisor?",
      answer: value.isDecisionMaker === "Si" ? "Si" : "No",
    },
    {
      questionKey: "decisionMakerName",
      question: "¿Quién es la persona correcta?",
      answer: value.decisionMakerName,
    },
    {
      questionKey: "financialSource",
      question: "¿De dónde sale su capacidad económica?",
      answer: value.financialSource,
    },
    {
      questionKey: "productFit",
      question: "Producto recomendado",
      answer: value.productFit,
    },
    {
      questionKey: "urgencyReason",
      question: "¿De dónde sale la urgencia?",
      answer: value.urgencyReason,
    },
    {
      questionKey: "extraInfo",
      question: "Información extra",
      answer: value.extraInfo,
    },
  ];

  if (value.scheduledDate !== "" && value.scheduledTime !== "") {
    questions.push(
      {
        questionKey: "scheduledDate",
        question: "Fecha",
        answer: value.scheduledDate,
      },
      {
        questionKey: "scheduledTime",
        question: "Hora",
        answer: value.scheduledTime,
      },
    );
  }

  if (value.closerFeedback.trim() !== "") {
    questions.push({
      questionKey: "closerFeedback",
      question: "Feedback del closer",
      answer: value.closerFeedback,
    });
  }

  return {
    leadId,
    isContacted: "Si",
    questions,
    ...(value.scheduledDate !== "" && value.scheduledTime !== ""
      ? {
          scheduledDate: value.scheduledDate,
          scheduledTime: value.scheduledTime,
        }
      : {}),
    extraNotes: value.extraInfo,
  };
}
