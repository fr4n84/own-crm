type TrpcErrorLike = {
  data?: { code?: string };
  message?: string;
};

const TRPC_CODE_MESSAGES: Record<string, string> = {
  NOT_FOUND: "No se encontró el recurso solicitado",
  UNAUTHORIZED: "No tenés permisos para realizar esta acción",
  FORBIDDEN: "No tenés permisos para realizar esta acción",
  BAD_REQUEST: "Datos inválidos en la solicitud",
  CONFLICT: "Ya existe un recurso con esos datos",
  INTERNAL_SERVER_ERROR: "Error del servidor, intentá de nuevo en unos minutos",
  TIMEOUT: "La operación tardó demasiado, intentá de nuevo",
  TOO_MANY_REQUESTS: "Demasiadas solicitudes, esperá un momento",
  CLIENT_CLOSED_REQUEST: "La solicitud fue cancelada",
};

function isTrpcErrorLike(value: unknown): value is TrpcErrorLike & { data: { code: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof (value as { data?: unknown }).data === "object" &&
    (value as { data?: { code?: unknown } }).data !== null &&
    typeof (value as { data: { code?: unknown } }).data.code === "string"
  );
}

/**
 * Convierte un error desconocido (tRPC, Error, o cualquier cosa) en un
 * mensaje user-friendly apto para mostrar en un toast.
 *
 * - Para errores de tRPC: traduce el `code` a español.
 * - Para `Error` comunes: usa `error.message`.
 * - Para todo lo demás: mensaje genérico.
 */
export function formatTrpcError(err: unknown): string {
  if (isTrpcErrorLike(err)) {
    const code = err.data.code;
    const translated = TRPC_CODE_MESSAGES[code];
    if (translated) return translated;
    return err.message ?? "Error desconocido";
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return "Error desconocido";
}
