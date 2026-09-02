import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const MESSAGE_KIND = {
  MESSAGE: "message",
  TASK: "task",
} as const;
export type MessageKind = (typeof MESSAGE_KIND)[keyof typeof MESSAGE_KIND];

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    participantOneId: text("participant_one_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    participantTwoId: text("participant_two_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    participantOneReadAt: timestamp("participant_one_read_at"),
    participantTwoReadAt: timestamp("participant_two_read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("conversations_participant_pair_unique").on(
      table.participantOneId,
      table.participantTwoId,
    ),
    index("conversations_participant_one_idx").on(table.participantOneId),
    index("conversations_participant_two_idx").on(table.participantTwoId),
    check(
      "conversations_distinct_participants_check",
      sql`${table.participantOneId} <> ${table.participantTwoId}`,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MessageKind>().notNull(),
    body: text("body").default("").notNull(),
    taskTitle: text("task_title"),
    taskAssigneeId: text("task_assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    taskDueAt: timestamp("task_due_at"),
    taskCompletedAt: timestamp("task_completed_at"),
    taskCompletedById: text("task_completed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("messages_conversation_created_at_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("messages_task_assignee_idx").on(table.taskAssigneeId),
    check("messages_kind_check", sql`${table.kind} IN ('message', 'task')`),
    check(
      "messages_content_check",
      sql`(${table.kind} = 'message' AND length(trim(${table.body})) > 0) OR (${table.kind} = 'task' AND ${table.taskTitle} IS NOT NULL AND ${table.taskAssigneeId} IS NOT NULL)`,
    ),
  ],
);

export const conversationsRelations = relations(
  conversations,
  ({ many, one }) => ({
    messages: many(messages),
    participantOne: one(user, {
      fields: [conversations.participantOneId],
      references: [user.id],
      relationName: "conversationParticipantOne",
    }),
    participantTwo: one(user, {
      fields: [conversations.participantTwoId],
      references: [user.id],
      relationName: "conversationParticipantTwo",
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(user, {
    fields: [messages.senderId],
    references: [user.id],
    relationName: "messageSender",
  }),
  taskAssignee: one(user, {
    fields: [messages.taskAssigneeId],
    references: [user.id],
    relationName: "messageTaskAssignee",
  }),
}));
