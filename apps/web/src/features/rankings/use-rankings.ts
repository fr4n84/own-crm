"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { trpc } from "@/utils/trpc";

export type RankingPeriod = "week" | "fortnight" | "month";

export function useRankings(period: RankingPeriod) {
  return useQuery({
    ...trpc.rankings.get.queryOptions({ period }),
    refetchInterval: 60_000,
  });
}

export function useUpdateRankingSettings() {
  const queryClient = useQueryClient();
  return useTrpcMutationWithToast(
    {
      ...trpc.rankings.updateSettings.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.rankings.get.queryKey(),
        });
      },
    },
    {
      success: "Puntuación de la liga actualizada",
      error: "Error al guardar la puntuación",
    },
  );
}
