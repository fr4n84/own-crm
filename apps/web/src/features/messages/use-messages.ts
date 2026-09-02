"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTrpcMutationWithToast } from "@/lib/use-trpc-mutation-with-toast";
import { trpc } from "@/utils/trpc";

export function useMessageUsers() {
  return useQuery(trpc.messages.listUsers.queryOptions());
}

export function useConversations() {
  return useQuery({
    ...trpc.messages.listConversations.queryOptions(),
    refetchInterval: 5_000,
  });
}

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    ...trpc.messages.getMessages.queryOptions({
      conversationId: conversationId ?? "unselected",
    }),
    enabled: Boolean(conversationId),
    refetchInterval: 5_000,
  });
}

function useInvalidateMessages() {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.messages.listConversations.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.messages.getMessages.queryKey(),
      }),
    ]);
  };
}

export function useStartConversation() {
  const invalidate = useInvalidateMessages();
  return useTrpcMutationWithToast(
    { ...trpc.messages.startConversation.mutationOptions(), onSuccess: invalidate },
    { success: "Conversación abierta", error: "Error al abrir la conversación" },
  );
}

export function useSendMessage() {
  const invalidate = useInvalidateMessages();
  return useTrpcMutationWithToast(
    { ...trpc.messages.sendMessage.mutationOptions(), onSuccess: invalidate },
    { error: "Error al enviar el mensaje" },
  );
}

export function useSendTask() {
  const invalidate = useInvalidateMessages();
  return useTrpcMutationWithToast(
    { ...trpc.messages.sendTask.mutationOptions(), onSuccess: invalidate },
    { success: "Tarea enviada", error: "Error al enviar la tarea" },
  );
}

export function useCompleteTask() {
  const invalidate = useInvalidateMessages();
  return useTrpcMutationWithToast(
    { ...trpc.messages.completeTask.mutationOptions(), onSuccess: invalidate },
    { success: "Tarea completada", error: "Error al completar la tarea" },
  );
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useTrpcMutationWithToast(
    {
      ...trpc.messages.markRead.mutationOptions(),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.messages.listConversations.queryKey(),
        });
      },
    },
    { error: "Error al marcar la conversación como leída" },
  );
}
