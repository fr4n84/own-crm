import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";

import { formatTrpcError } from "./format-trpc-error";

type ToastMessages = {
  /**
   * Mensaje de éxito. Si se omite, no se muestra toast de éxito.
   */
  success?: string;
  /**
   * Prefijo del mensaje de error. El detalle saneado del error se concatena.
   * Ejemplo: "Error al asignar el lead" → "Error al asignar el lead: No se encontró el recurso"
   */
  error: string;
};

/**
 * Wrapper de `useMutation` que muestra toasts automáticos:
 * - `success` (opcional): al completarse correctamente.
 * - `error` (siempre): al fallar, con un mensaje saneado en español.
 *
 * Mantiene la firma de tRPC `mutationOptions()` y permite encadenar
 * `onSuccess`/`onError` del usuario (ej: invalidar queries, cerrar drawer).
 *
 * @example
 * ```ts
 * const mutation = useTrpcMutationWithToast(
 *   trpc.leads.assignLead.mutationOptions(),
 *   {
 *     success: "Lead asignado correctamente",
 *     error: "Error al asignar el lead",
 *   },
 * );
 * ```
 */
export function useTrpcMutationWithToast<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
  messages: ToastMessages,
): ReturnType<typeof useMutation<TData, TError, TVariables, TContext>> {
  return useMutation<TData, TError, TVariables, TContext>({
    ...options,
    onSuccess: async (data, variables, context, mutation) => {
      await options.onSuccess?.(data, variables, context, mutation);
      if (messages.success) {
        toast.success(messages.success);
      }
    },
    onError: (error, variables, context, mutation) => {
      options.onError?.(error, variables, context, mutation);
      toast.error(`${messages.error}: ${formatTrpcError(error)}`);
    },
  });
}
