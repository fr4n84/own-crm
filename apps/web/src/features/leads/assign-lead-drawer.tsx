"use client";

import { useState } from "react";
import { UserRoundPlus } from "lucide-react";
import { Button } from "@crm-fran/ui/components/button";

import { authClient } from "@/lib/auth-client";
import { usePermissionState } from "@crm-fran/ui/permissions";

import LeadDrawer from "@/components/lead-drawer/lead-drawer";
import AssignLeadForm from "./assign-lead-form";
import CloserQAForm from "./closer-qa-form";

// ── Public types ─────────────────────────────────────────────────────────────

export interface Lead {
    id: string;
    name: string;
    email: string | null;
	phone: string;
	type: "maestra" | "vsl";
	state: string;
    response: string;
    feedback: string;
    questions: {
        question: string;
        answer: string;
        authorRole: "caller" | "closer";
        authorId: string | null;
        questionKey?: string;
    }[];
    callerId: string | null;
    closerId: string | null;
    caller: { id: string; name: string; email: string } | null;
    closer: { id: string; name: string; email: string } | null;
    createdAt: string;
    updatedAt: string;
}

interface AssignLeadDrawerProps {
    lead: Pick<Lead, "id" | "closerId" | "questions">;
    triggerLabel?: string;
    mode?: "default" | "agenda-feedback" | "post-assignment-feedback";
    defaultOpen?: boolean;
    hideTrigger?: boolean;
		onOpen?: () => void | Promise<void>;
		onCompleted?: () => void | Promise<void>;
}

// ── Role detection ───────────────────────────────────────────────────────────

type DrawerRole = "role-admin" | "role-caller" | "role-closer";

function resolveRole(
    permissions: readonly string[],
    sessionRoleId: string | null | undefined,
): DrawerRole {
    if (permissions.includes("*")) {
        return "role-admin";
    }
    if (sessionRoleId === "role-closer") {
        return "role-closer";
    }
    return "role-caller";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AssignLeadDrawer({
    lead,
    triggerLabel,
    mode = "default",
    defaultOpen = false,
    hideTrigger = false,
		onOpen,
		onCompleted,
}: AssignLeadDrawerProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [closerSubmitLabel, setCloserSubmitLabel] = useState("Guardar");
    const [callerSubmitLabel, setCallerSubmitLabel] = useState("Guardar");
		const [businessCompleted, setBusinessCompleted] = useState(false);
		const [completionState, setCompletionState] = useState<"idle" | "pending" | "error">("idle");
		const [completionError, setCompletionError] = useState<string | null>(null);

    const { data: session } = authClient.useSession();
    const { permissions } = usePermissionState();



    const role = resolveRole(
        permissions,
        (session?.user as { roleId?: string } | undefined)?.roleId,
    );
    const isAgendaFeedback = mode === "agenda-feedback";
    const isPostAssignmentFeedback = mode === "post-assignment-feedback";
		const isAssignedCloser = session?.user?.id === lead.closerId;
		const completeRecommendation = async () => {
			setCompletionState("pending");
			setCompletionError(null);
			try {
				await onCompleted?.();
				setBusinessCompleted(false);
				setCompletionState("idle");
				setCompletionError(null);
				setOpen(false);
			} catch {
				setCompletionState("error");
				setCompletionError("La gestión se guardó, pero no se pudo registrar la recomendación. Reinténtalo sin guardar de nuevo.");
			}
		};
		const handleBusinessSuccess = () => {
			setBusinessCompleted(true);
			void completeRecommendation();
		};
    const showsCloserFeedback =
      role === "role-closer" || (isAgendaFeedback && (role === "role-admin" || isAssignedCloser));
    const showsCallerActions =
      !isAgendaFeedback && (role === "role-caller" || role === "role-admin");

    // El id del form que el botón Guardar del drawer debe disparar.
    const submitFormId = showsCloserFeedback
      ? "closer-qa-form"
      : "assign-lead-form";

    const titleByRole: Record<DrawerRole, { title: string; description: string }> = {
        "role-caller": {
            title: "Asignar lead",
            description: "Completá la información para asignar este lead a un closer.",
        },
        "role-closer": {
            title: "Editar respuestas (closer)",
            description: "Modificá tus respuestas registradas en la sesión.",
        },
        "role-admin": {
            title: "Gestionar lead",
            description: "Registra el contacto y el resultado de la gestión.",
        },
    };

    const { title, description } = isAgendaFeedback
      ? {
          title: "Feedback de agenda",
          description: "Registra qué ha ocurrido con esta agenda.",
        }
      : isPostAssignmentFeedback
        ? {
            title: "Añadir feedback",
            description: "El lead ya es tuyo. Registra ahora qué ha sucedido sin cambiar de pestaña.",
          }
      : titleByRole[role];

    if (isAgendaFeedback && !showsCloserFeedback) {
      return null;
    }

    return (
      <>
        {!hideTrigger && (
          <Button
            variant="outline"
            onClick={() => {
              if (businessCompleted) return;
              setCompletionState("idle");
              setCompletionError(null);
              setOpen(true);
              void Promise.resolve(onOpen?.()).catch(() => undefined);
            }}
            aria-label={triggerLabel ?? "Abrir drawer"}
          >
            <UserRoundPlus />
            {triggerLabel}
          </Button>
        )}

        <LeadDrawer
          open={open}
		  onOpenChange={(nextOpen) => { if (!businessCompleted) setOpen(nextOpen); }}
          title={title}
          description={description}
          type="edit"
		  submitFormId={businessCompleted ? undefined : submitFormId}
          submitLabel={
            showsCloserFeedback
              ? closerSubmitLabel
              : callerSubmitLabel
          }
        >
		  {!businessCompleted && showsCloserFeedback && (
            <CloserQAForm
              leadId={lead.id}
              currentCloserId={lead.closerId}
              leadQuestions={lead.questions.filter(
                (q) => q.authorRole === "closer",
              )}
              onCancel={() => setOpen(false)}
				  onSuccess={handleBusinessSuccess}
              onSubmitLabelChange={setCloserSubmitLabel}
            />
          )}

		  {!businessCompleted && showsCallerActions && (
            <AssignLeadForm
              leadId={lead.id}
              onCancel={() => setOpen(false)}
				  onSuccess={handleBusinessSuccess}
              leadQuestions={lead.questions}
              currentCloserId={lead.closerId}
              onSubmitLabelChange={setCallerSubmitLabel}
            />
	          )}
			  {businessCompleted && (
				  <div className="flex flex-col gap-3 border p-4" role="status">
					  <p className={completionState === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{completionError ?? "La gestión se guardó. Espera a que termine el registro."}</p>
					  {completionState === "error" && <Button type="button" onClick={() => { void completeRecommendation(); }}>Reintentar registro</Button>}
				  </div>
			  )}
        </LeadDrawer>
      </>
    );
}
