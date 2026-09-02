"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { trpc } from "@/utils/trpc";

export function useCalendarEvents(from: string, to: string) {
  return useQuery(trpc.calendar.list.queryOptions({ from, to }));
}

export function useCalendarAssignees() {
  return useQuery(trpc.calendar.listAssignees.queryOptions());
}

export function useCalendarPreferences() {
  return useQuery(trpc.calendar.getPreferences.queryOptions());
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useTrpcMutationWithToast(
    {
      ...trpc.calendar.create.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.calendar.list.queryKey(),
        });
      },
    },
    {
      success: "Evento añadido al calendario",
      error: "Error al añadir el evento",
    },
  );
}

export function useUpdateCalendarPreferences() {
  const queryClient = useQueryClient();

  return useTrpcMutationWithToast(
    {
      ...trpc.calendar.updatePreferences.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.calendar.getPreferences.queryKey(),
        });
      },
    },
    {
      success: "Duración de agendas guardada",
      error: "Error al guardar la duración",
    },
  );
}
