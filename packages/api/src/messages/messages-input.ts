import { z } from "zod";

export function orderParticipantIds(firstId: string, secondId: string) {
  return firstId < secondId
    ? ([firstId, secondId] as const)
    : ([secondId, firstId] as const);
}

export const conversationIdInputSchema = z.object({
  conversationId: z.string().min(1),
});

export const startConversationInputSchema = z.object({
  participantId: z.string().min(1),
});

export const sendMessageInputSchema = conversationIdInputSchema.extend({
  body: z.string().trim().min(1).max(5000),
});

export const sendTaskInputSchema = conversationIdInputSchema.extend({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  assigneeId: z.string().min(1),
  dueAt: z.string().datetime().nullable().optional(),
});

export const completeTaskInputSchema = z.object({
  messageId: z.string().min(1),
});
