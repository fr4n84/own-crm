import { TRPCError } from "@trpc/server";

import {
  alias,
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  or,
} from "@crm-fran/db";
import {
  conversations,
  MESSAGE_KIND,
  messages,
  user,
} from "@crm-fran/db/schema/index";

import { router } from "../index";
import { protectedProcedure } from "../index";
import {
  completeTaskInputSchema,
  conversationIdInputSchema,
  orderParticipantIds,
  sendMessageInputSchema,
  sendTaskInputSchema,
  startConversationInputSchema,
} from "../messages/messages-input";

const participantOne = alias(user, "message_participant_one");
const participantTwo = alias(user, "message_participant_two");
const sender = alias(user, "message_sender");
const taskAssignee = alias(user, "message_task_assignee");

async function getConversationForActor(conversationId: string, actorId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(
          eq(conversations.participantOneId, actorId),
          eq(conversations.participantTwoId, actorId),
        ),
      ),
    )
    .limit(1);

  if (!conversation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  }

  return conversation;
}

export const messagesRouter = router({
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const users = await db
      .select({ id: user.id, name: user.name, email: user.email, roleId: user.roleId })
      .from(user)
      .orderBy(asc(user.name));

    return users.filter((candidate) => candidate.id !== ctx.session.user.id);
  }),

  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const actorId = ctx.session.user.id;
    const rows = await db
      .select({
        id: conversations.id,
        participantOneId: conversations.participantOneId,
        participantTwoId: conversations.participantTwoId,
        participantOneReadAt: conversations.participantOneReadAt,
        participantTwoReadAt: conversations.participantTwoReadAt,
        updatedAt: conversations.updatedAt,
        participantOne: {
          id: participantOne.id,
          name: participantOne.name,
          email: participantOne.email,
          roleId: participantOne.roleId,
        },
        participantTwo: {
          id: participantTwo.id,
          name: participantTwo.name,
          email: participantTwo.email,
          roleId: participantTwo.roleId,
        },
      })
      .from(conversations)
      .innerJoin(
        participantOne,
        eq(participantOne.id, conversations.participantOneId),
      )
      .innerJoin(
        participantTwo,
        eq(participantTwo.id, conversations.participantTwoId),
      )
      .where(
        or(
          eq(conversations.participantOneId, actorId),
          eq(conversations.participantTwoId, actorId),
        ),
      )
      .orderBy(desc(conversations.updatedAt));

    const conversationIds = rows.map((row) => row.id);
    const conversationMessages =
      conversationIds.length > 0
        ? await db
            .select({
              id: messages.id,
              conversationId: messages.conversationId,
              senderId: messages.senderId,
              kind: messages.kind,
              body: messages.body,
              taskTitle: messages.taskTitle,
              taskCompletedAt: messages.taskCompletedAt,
              createdAt: messages.createdAt,
            })
            .from(messages)
            .where(inArray(messages.conversationId, conversationIds))
            .orderBy(asc(messages.createdAt))
        : [];

    return rows.map((row) => {
      const rowMessages = conversationMessages.filter(
        (message) => message.conversationId === row.id,
      );
      const readAt =
        row.participantOneId === actorId
          ? row.participantOneReadAt
          : row.participantTwoReadAt;
      const unreadCount = rowMessages.filter(
        (message) =>
          message.senderId !== actorId &&
          (!readAt || message.createdAt.getTime() > readAt.getTime()),
      ).length;

      return {
        id: row.id,
        participant:
          row.participantOneId === actorId
            ? row.participantTwo
            : row.participantOne,
        lastMessage: rowMessages.at(-1) ?? null,
        unreadCount,
        updatedAt: row.updatedAt,
      };
    });
  }),

  getMessages: protectedProcedure
    .input(conversationIdInputSchema)
    .query(async ({ ctx, input }) => {
      await getConversationForActor(input.conversationId, ctx.session.user.id);

      return db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          kind: messages.kind,
          body: messages.body,
          taskTitle: messages.taskTitle,
          taskAssigneeId: messages.taskAssigneeId,
          taskDueAt: messages.taskDueAt,
          taskCompletedAt: messages.taskCompletedAt,
          taskCompletedById: messages.taskCompletedById,
          createdAt: messages.createdAt,
          sender: { id: sender.id, name: sender.name },
          taskAssignee: { id: taskAssignee.id, name: taskAssignee.name },
        })
        .from(messages)
        .innerJoin(sender, eq(sender.id, messages.senderId))
        .leftJoin(taskAssignee, eq(taskAssignee.id, messages.taskAssigneeId))
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(asc(messages.createdAt));
    }),

  startConversation: protectedProcedure
    .input(startConversationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.session.user.id;
      if (input.participantId === actorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot message yourself" });
      }

      const [participant] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, input.participantId))
        .limit(1);
      if (!participant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [participantOneId, participantTwoId] = orderParticipantIds(
        actorId,
        input.participantId,
      );
      const [created] = await db
        .insert(conversations)
        .values({
          id: crypto.randomUUID(),
          participantOneId,
          participantTwoId,
        })
        .onConflictDoNothing()
        .returning();

      if (created) return created;

      const [existing] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.participantOneId, participantOneId),
            eq(conversations.participantTwoId, participantTwoId),
          ),
        )
        .limit(1);
      return existing;
    }),

  sendMessage: protectedProcedure
    .input(sendMessageInputSchema)
    .mutation(async ({ ctx, input }) => {
      await getConversationForActor(input.conversationId, ctx.session.user.id);
      const now = new Date();
      const [message] = await db
        .insert(messages)
        .values({
          id: crypto.randomUUID(),
          conversationId: input.conversationId,
          senderId: ctx.session.user.id,
          kind: MESSAGE_KIND.MESSAGE,
          body: input.body,
        })
        .returning();
      await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, input.conversationId));
      return message;
    }),

  sendTask: protectedProcedure
    .input(sendTaskInputSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await getConversationForActor(
        input.conversationId,
        ctx.session.user.id,
      );
      if (
        input.assigneeId !== conversation.participantOneId &&
        input.assigneeId !== conversation.participantTwoId
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid task assignee" });
      }

      const now = new Date();
      const [message] = await db
        .insert(messages)
        .values({
          id: crypto.randomUUID(),
          conversationId: input.conversationId,
          senderId: ctx.session.user.id,
          kind: MESSAGE_KIND.TASK,
          body: input.description ?? "",
          taskTitle: input.title,
          taskAssigneeId: input.assigneeId,
          taskDueAt: input.dueAt ? new Date(input.dueAt) : null,
        })
        .returning();
      await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, input.conversationId));
      return message;
    }),

  completeTask: protectedProcedure
    .input(completeTaskInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [task] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, input.messageId))
        .limit(1);
      if (!task || task.kind !== MESSAGE_KIND.TASK) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }
      await getConversationForActor(task.conversationId, ctx.session.user.id);
      if (task.taskAssigneeId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the assignee can complete this task" });
      }
      if (task.taskCompletedAt) return task;

      const [completed] = await db
        .update(messages)
        .set({
          taskCompletedAt: new Date(),
          taskCompletedById: ctx.session.user.id,
        })
        .where(eq(messages.id, input.messageId))
        .returning();
      return completed;
    }),

  markRead: protectedProcedure
    .input(conversationIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await getConversationForActor(
        input.conversationId,
        ctx.session.user.id,
      );
      const readAt = new Date();
      await db
        .update(conversations)
        .set(
          conversation.participantOneId === ctx.session.user.id
            ? { participantOneReadAt: readAt }
            : { participantTwoReadAt: readAt },
        )
        .where(eq(conversations.id, input.conversationId));
      return { readAt };
    }),
});
