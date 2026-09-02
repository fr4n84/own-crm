"use client";

import { useState } from "react";

import { Input } from "@crm-fran/ui/components/input";
import { Textarea } from "@crm-fran/ui/components/textarea";
import {
  FieldGroup,
  Field,
  FieldLabel,
} from "@crm-fran/ui/components/field";

import { CALLER_QUESTIONS, CLOSER_QUESTIONS } from "./qa-questions";

type Answers = Record<string, string>;

type AdminTab = "caller" | "closer";

interface AdminQAEditorProps {
  /**
   * Tab activo. Lo controla el padre (assign-lead-drawer), que es quien
   * sabe qué form disparar desde el footer del drawer.
   */
  activeTab: AdminTab;
  initialCallerAnswers?: Answers;
  initialCloserAnswers?: Answers;
}

// Componente "tonto": sin Tabs propios, sin botón submit propio.
// Solo pinta el form del tab activo. El padre controla el tab y el submit.
export default function AdminQAEditor({
  activeTab,
  initialCallerAnswers = {},
  initialCloserAnswers = {},
}: AdminQAEditorProps) {
  if (activeTab === "closer") {
    return (
      <SessionForm
        formId="admin-closer-form"
        testId="admin-closer-form"
        questions={CLOSER_QUESTIONS}
        initialAnswers={initialCloserAnswers}
      />
    );
  }

  return (
    <SessionForm
      formId="admin-caller-form"
      testId="admin-caller-form"
      questions={CALLER_QUESTIONS}
      initialAnswers={initialCallerAnswers}
    />
  );
}

interface SessionFormProps {
  formId: string;
  testId: string;
  questions: readonly string[];
  initialAnswers: Answers;
}

function SessionForm({
  formId,
  testId,
  questions,
  initialAnswers,
}: SessionFormProps) {
  const [values, setValues] = useState<Answers>(() => {
    const seeded: Answers = {};
    for (const question of questions) {
      seeded[question] = initialAnswers[question] ?? "";
    }
    return seeded;
  });

  const handleChange = (question: string, value: string) => {
    setValues((prev) => ({ ...prev, [question]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-lg"
      id={formId}
      data-testid={testId}
    >
      <FieldGroup>
        <p className="text-muted-foreground text-sm">
          Estás editando las respuestas.
        </p>

        {questions.map((question) => {
          const answer = values[question] ?? "";
          const isLongText =
            question.includes("económica") ||
            question.includes("urgencia") ||
            question.includes("extra");

          return (
            <Field key={question}>
              <FieldLabel>{question}</FieldLabel>
              {isLongText ? (
                <Textarea
                  value={answer}
                  onChange={(e) => handleChange(question, e.target.value)}
                  className="min-h-20 resize-none"
                />
              ) : (
                <Input
                  value={answer}
                  onChange={(e) => handleChange(question, e.target.value)}
                />
              )}
            </Field>
          );
        })}
      </FieldGroup>
    </form>
  );
}
