"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";

export type Alert = {
		id: string;
			lead: {
				id: string;
				name: string;
				phone: string;
				closerId: string | null;
			caller: { id: string; name: string } | null;
			closer: { id: string; name: string } | null;
				questions: Array<{
					questionKey: string;
					question: string;
					answer: string;
					authorRole: "caller" | "closer";
					authorId: string | null;
			}>;
		} | null;
	targetUser: { name: string } | null;
	kind: string;
	severity: string;
	message: string;
	nextShowAt: Date | string;
	createdAt: Date | string;
};

export function useAlerts(
	filters: {
		leadId?: string;
		targetUserId?: string;
		includeDismissed?: boolean;
		includeResolved?: boolean;
		limit?: number;
		offset?: number;
	} = {},
) {
	return useQuery({
		...trpc.alerts.listAlerts.queryOptions(filters),
			select: (data) =>
				data.map((alert) => ({
					id: alert.id,
					lead: alert.lead
							? {
									id: alert.lead.id,
									name: alert.lead.name,
									phone: alert.lead.phone,
									closerId: alert.lead.closerId,
									caller: alert.lead.caller
									? {
											id: alert.lead.caller.id,
											name: alert.lead.caller.name,
										}
										: null,
									closer: alert.lead.closer
										? {
												id: alert.lead.closer.id,
												name: alert.lead.closer.name,
											}
										: null,
									questions: alert.lead.questions.map((question) => ({
											questionKey: question.questionKey,
											question: question.question,
											answer: question.answer,
											authorRole: question.authorRole,
											authorId: question.authorId,
									})),
								}
						: null,
				targetUser: alert.targetUser ? { name: alert.targetUser.name } : null,
				kind: alert.kind,
				severity: alert.severity,
					message: alert.message,
					nextShowAt: alert.nextShowAt,
					createdAt: alert.createdAt,
				})),
	});
}

export function useAlertsCount() {
	return useQuery({
		...trpc.alerts.countAlerts.queryOptions(),
		refetchInterval: 30_000, // poll every 30s
	});
}

export function useLeadRiskQueue() {
  return useQuery({
    ...trpc.alerts.listLeadRiskQueue.queryOptions(),
    refetchInterval: 60_000,
  });
}

export function useNextBestActionModes() {
	return useQuery({
		...trpc.alerts.getNextBestActionModes.queryOptions(),
		staleTime: 60_000,
	});
}

export function useNextBestActions(mode: "caller" | "closer", enabled = true) {
	return useQuery({
		...trpc.alerts.listNextBestActions.queryOptions({ mode }),
		enabled,
		refetchInterval: 60_000,
	});
}

export function useNextBestActionMetrics(mode: "caller" | "closer", enabled = true) {
	return useQuery({
		...trpc.alerts.getNextBestActionMetrics.queryOptions({ mode }),
		enabled,
		refetchInterval: 60_000,
	});
}

export function useRecordNextBestActionEvent() {
	const queryClient = useQueryClient();
	return useTrpcMutationWithToast(
		{
			...trpc.alerts.recordNextBestActionEvent.mutationOptions(),
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: trpc.alerts.listNextBestActions.queryKey() }),
					queryClient.invalidateQueries({ queryKey: trpc.alerts.getNextBestActionMetrics.queryKey() }),
				]);
			},
		},
		{ success: "Actividad de recomendación registrada", error: "No se pudo registrar la actividad" },
	);
}

export function useAlertPreferences() {
  return useQuery({
    ...trpc.alerts.getPreferences.queryOptions(),
    select: (preferences) => ({
      mode: preferences.relevanceMode,
      urgentThresholdHours: preferences.urgentThresholdHours,
      warningThresholdHours: preferences.warningThresholdHours,
      conditionSeverities: {
        no_contact: preferences.noContactSeverity,
        follow_up: preferences.followUpSeverity,
        future_call: preferences.futureCallSeverity,
        appointment: preferences.appointmentSeverity,
        rescheduled: preferences.rescheduledSeverity,
      },
    }),
  });
}

export function useUpdateAlertPreferences() {
  const queryClient = useQueryClient();

  return useTrpcMutationWithToast(
    {
      ...trpc.alerts.updatePreferences.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.alerts.getPreferences.queryKey(),
        });
      },
    },
    {
      success: "Configuración de alertas guardada",
      error: "Error al guardar la configuración de alertas",
    },
  );
}

export function useDismissAlert() {
  const queryClient = useQueryClient();

  return useTrpcMutationWithToast(
    {
      ...trpc.alerts.dismissAlert.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.alerts.listAlerts.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.alerts.countAlerts.queryKey(),
        });
      },
    },
    {
      success: "Alerta descartada",
      error: "Error al descartar la alerta",
    },
  );
}

export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useTrpcMutationWithToast(
    {
      ...trpc.alerts.resolveAlert.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.alerts.listAlerts.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.alerts.countAlerts.queryKey(),
        });
      },
    },
    {
      success: "Alerta resuelta",
      error: "Error al resolver la alerta",
    },
  );
}

export function useAdvanceRecurringAlerts() {
  return useQuery({
    ...trpc.alerts.advanceRecurringAlerts.queryOptions(),
    refetchInterval: 900_000,
  });
}
