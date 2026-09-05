import { z } from "zod";

export const suggestionInput = z.object({
  body: z.string().trim().min(1, "Escribe una sugerencia").max(4_000, "La sugerencia no puede superar 4000 caracteres"),
  anonymous: z.boolean(),
});

export function suggestionAuthorId({ anonymous, userId }: { anonymous: boolean; userId: string }) {
  return anonymous ? null : userId;
}
